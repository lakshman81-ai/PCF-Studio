/**
 * rc-master-loader.js — "Load data from Masters" logic for the CSV→PCF tab.
 * Populates CA attributes, RATING, and weight (CA8) on all components
 * using Linelist Manager, Piping Class Master, and Weight Config data.
 *
 * Steps:
 *   1. CA1/2/5/10 from linelist (by lineNoKey); CA3/CA4 from piping class master (bore + pipingClass)
 *   2. RATING from piping class prefix (user-configured 2-char then 1-char map)
 *   3. CA8 (weight) from weight master (bore + rating + length ±6mm)
 */

import { linelistService } from '../services/linelist-service.js';
import { dataManager }     from '../services/data-manager.js';
import { resolveWeightForCa8 } from '../services/fallbackcontract.js';

const WEIGHT_TYPES = new Set([
  'FLANGE', 'VALVE', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC'
]);

/**
 * Populate CA fields, rating, and CA8 on every component in-place.
 * @param {Array}  components  rcState.components array (mutated in-place)
 * @param {Object} cfg         getConfig() result (for ratingPrefixMap)
 * @returns {number} count of components that were updated
 */
export async function loadMastersInto(components, cfg) {
  const map2 = (cfg?.ratingPrefixMap?.twoChar) || { '10':10000,'20':20000,'15':1500,'25':2500 };
  const map1 = (cfg?.ratingPrefixMap?.oneChar) || { '1':150,'3':300,'6':600,'9':900,'5':5000 };
  const pcData     = dataManager.getPipingClassMaster() || [];
  const weightData = dataManager.getWeights() || [];

  let updated = 0;

  for (const comp of components) {
    let changed = false;

    // ── Step 1a: CA1/2/5/10 from Linelist Manager ──────────────────
    if (comp.lineNoKey) {
      try {
        const attrs = linelistService.getSmartAttributes(comp.lineNoKey);
        if (attrs?.Found) {
          if (attrs.P1   != null && attrs.P1   !== '') { comp.ca1  = attrs.P1;   changed = true; }
          if (attrs.T1   != null && attrs.T1   !== '') { comp.ca2  = attrs.T1;   changed = true; }
          if (attrs.InsThk != null && attrs.InsThk !== '') { comp.ca5 = attrs.InsThk; changed = true; }
          if (attrs.HP   != null && attrs.HP   !== '') { comp.ca10 = attrs.HP;   changed = true; }
        }
      } catch (_) { /* linelist not loaded — skip */ }
    }

    // ── Step 1b: CA3/CA4 from Piping Class Master ───────────────────
    if (comp.pipingClass && pcData.length > 0) {
      const bore = parseFloat(comp.bore) || 0;
      const pcClass = String(comp.pipingClass).trim();
      const match = pcData.find(r =>
        String(r['Piping Class'] || r['piping_class'] || r['PipingClass'] || '').trim() === pcClass &&
        Math.abs(parseFloat(r['Size'] || r['DN'] || r['NPS'] || 0) - bore) < 1
      );
      if (match) {
        const mat  = match['Material_Name'] || match['Material'] || match['material'] || '';
        const wall = match['Wall thickness'] || match['WallThickness'] || match['Wall_Thickness'] || '';
        if (mat)  { comp.ca3 = mat;  changed = true; }
        if (wall) { comp.ca4 = wall; changed = true; }
      }
    }

    // ── Step 2: Rating from piping class prefix ─────────────────────
    if (comp.pipingClass) {
      const s  = String(comp.pipingClass).trim();
      const r2 = map2[s.slice(0, 2)];
      const r1 = map1[s.slice(0, 1)];
      const newRating = r2 ?? r1 ?? null;
      if (newRating != null) {
        comp.rating = newRating;
        changed = true;
      }
    }

    // ── Step 3: CA8 (weight) via unified resolver ────────────────────
    if (WEIGHT_TYPES.has(comp.type) && weightData.length > 0) {
      const resolution = resolveWeightForCa8({
        type: comp.type,
        directWeight: comp.ca8,
        boreMm: comp.bore,
        ratingClass: comp.rating,
        valveType: comp.itemDescription || comp.description || ''
      }, { includeApprovedFittings: true });
      if (resolution.weight != null) {
        comp.ca8 = resolution.weight;
        comp.ca8Trace = resolution.trace.join(' > ');
        changed = true;
      }
    }

    if (changed) updated++;
  }

  return updated;
}
