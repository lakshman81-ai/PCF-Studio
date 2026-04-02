import { dataManager } from './data-manager.js';

const STORAGE_KEY = 'pcf_master_new_tables_v1';
const TABLE4_URL = 'https://github.com/lakshman81-ai/PCF-Studio/blob/14dd06e463a91a0c240b2b8afe36daee1d13013d/Docs/Masters/wtValveweights.xlsx';

const defaults = {
  table1EqualTee: [
    { bore_mm: 15, brlen_mm: 25 }, { bore_mm: 20, brlen_mm: 29 }, { bore_mm: 25, brlen_mm: 38 },
    { bore_mm: 32, brlen_mm: 48 }, { bore_mm: 40, brlen_mm: 57 }, { bore_mm: 50, brlen_mm: 64 },
    { bore_mm: 65, brlen_mm: 76 }, { bore_mm: 80, brlen_mm: 86 }, { bore_mm: 100, brlen_mm: 105 },
    { bore_mm: 125, brlen_mm: 124 }, { bore_mm: 150, brlen_mm: 143 }, { bore_mm: 200, brlen_mm: 178 },
    { bore_mm: 250, brlen_mm: 216 }, { bore_mm: 300, brlen_mm: 254 }, { bore_mm: 350, brlen_mm: 279 },
    { bore_mm: 400, brlen_mm: 305 }, { bore_mm: 450, brlen_mm: 343 }, { bore_mm: 500, brlen_mm: 381 },
    { bore_mm: 600, brlen_mm: 432 }
  ],
  table2ReducingTee: [
    { header_bore_mm: 100, branch_bore_mm: 80, brlen_mm: 102 }, { header_bore_mm: 100, branch_bore_mm: 50, brlen_mm: 95 },
    { header_bore_mm: 150, branch_bore_mm: 100, brlen_mm: 130 }, { header_bore_mm: 150, branch_bore_mm: 80, brlen_mm: 124 },
    { header_bore_mm: 200, branch_bore_mm: 150, brlen_mm: 168 }, { header_bore_mm: 200, branch_bore_mm: 100, brlen_mm: 156 }
  ],
  table3Weldolet: [
    { header_bore_mm: 50, branch_bore_mm: 20, A_mm: 38.1, header_od_mm: 60.3 },
    { header_bore_mm: 80, branch_bore_mm: 40, A_mm: 44.4, header_od_mm: 88.9 },
    { header_bore_mm: 100, branch_bore_mm: 50, A_mm: 57.2, header_od_mm: 114.3 },
    { header_bore_mm: 150, branch_bore_mm: 80, A_mm: 76.2, header_od_mm: 168.3 },
    { header_bore_mm: 200, branch_bore_mm: 100, A_mm: 88.9, header_od_mm: 219.1 },
    { header_bore_mm: 300, branch_bore_mm: 150, A_mm: 114.3, header_od_mm: 323.9 }
  ],
  table4Meta: { sourceUrl: TABLE4_URL }
};

class MasterTableService {
  constructor() {
    this.tables = this._load();
  }

  _n(v) { const n = Number.parseFloat(String(v ?? '').trim()); return Number.isFinite(n) ? n : null; }
  _s(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaults);
      return { ...structuredClone(defaults), ...JSON.parse(raw) };
    } catch {
      return structuredClone(defaults);
    }
  }

  _save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.tables)); }

  getTables() { return this.tables; }

  updateTable(name, rows) {
    if (!Array.isArray(rows)) return;
    this.tables[name] = rows;
    this._save();
  }

  getTeeBrlen(headerBore, branchBore) {
    const h = this._n(headerBore);
    const b = this._n(branchBore);
    if (h == null || b == null) return null;
    if (Math.abs(h - b) < 1e-6) {
      const row = this.tables.table1EqualTee.find(r => this._n(r.bore_mm) === h);
      return this._n(row?.brlen_mm);
    }
    const row = this.tables.table2ReducingTee.find(r => this._n(r.header_bore_mm) === h && this._n(r.branch_bore_mm) === b);
    return this._n(row?.brlen_mm);
  }

  getOletBrlen(headerBore, branchBore) {
    const h = this._n(headerBore);
    const b = this._n(branchBore);
    const row = this.tables.table3Weldolet.find(r => this._n(r.header_bore_mm) === h && this._n(r.branch_bore_mm) === b);
    if (!row) return null;
    const A = this._n(row.A_mm);
    const od = this._n(row.header_od_mm);
    return A == null || od == null ? null : A + (0.5 * od);
  }

  _normalizedWeightRows() {
    const rows = dataManager.getWeights() || [];
    return rows.map((row) => {
      const bore = this._n(row.DN ?? row['Size (NPS)'] ?? row.Size ?? row.NS);
      const rating = this._n(String(row.Rating ?? '').replace(/[^\d.]/g, ''));
      const flangeWeight = this._n(row['RF/RTJ KG'] ?? row['Flange Weight'] ?? row.Weight);
      const valveType = this._s(row['Type Description'] ?? row['Valve Type'] ?? row.Type ?? '');
      const valveWeight = this._n(row['Valve Weight'] ?? row['RF/RTJ KG'] ?? row.Weight);
      const qualityOk = bore != null && (flangeWeight != null || valveWeight != null);
      return {
        bore_mm: bore,
        rating_class: rating,
        flange_weight: flangeWeight,
        valve_type: valveType,
        valve_weight: valveWeight,
        quality_ok: qualityOk
      };
    });
  }

  getWeightByBoreAndClass(boreMm, ratingClass) {
    const b = this._n(boreMm);
    const rc = this._n(ratingClass);
    const exact = this._normalizedWeightRows().find(r => r.quality_ok && r.bore_mm === b && r.rating_class === rc);
    return exact?.flange_weight ?? null;
  }

  getValveWeightByType(valveType, boreMm = null, ratingClass = null) {
    const t = this._s(valveType).toLowerCase();
    const b = this._n(boreMm);
    const rc = this._n(ratingClass);
    const rows = this._normalizedWeightRows().filter(r => r.quality_ok);
    const exact = rows.find(r => r.valve_type.toLowerCase() === t && (b == null || r.bore_mm === b) && (rc == null || r.rating_class === rc));
    if (exact) return exact.valve_weight ?? exact.flange_weight ?? null;
    const fallback = rows.find(r => r.valve_type.toLowerCase() === t);
    return fallback?.valve_weight ?? fallback?.flange_weight ?? null;
  }

  resolveComponentWeight({ type, directWeight, boreMm, ratingClass, valveType }) {
    const trace = [];
    const t = this._s(type).toUpperCase();
    if (!['FLANGE', 'VALVE', 'TEE', 'OLET', 'REDUCER-CONCENTRIC', 'REDUCER-ECCENTRIC'].includes(t)) {
      trace.push('blocked:unsupported-type');
      return { weight: null, trace };
    }

    const direct = this._n(directWeight);
    if (direct != null && direct > 0) {
      trace.push('direct-input-weight');
      return { weight: direct, trace };
    }

    const exactWeight = this.getWeightByBoreAndClass(boreMm, ratingClass);
    if (exactWeight != null) {
      trace.push('table4-exact-bore-class');
      if (t === 'VALVE' && valveType) {
        const v = this.getValveWeightByType(valveType, boreMm, ratingClass);
        if (v != null) return { weight: v, trace: [...trace, 'table4-exact-valve-type'] };
      }
      return { weight: exactWeight, trace };
    }

    const c300 = this.getWeightByBoreAndClass(boreMm, 300);
    if (c300 != null) {
      trace.push('fallback-class-300');
      return { weight: c300, trace };
    }

    if (t === 'VALVE') {
      const vb = this.getValveWeightByType(valveType || 'Ball valve (reduced bore)', boreMm, ratingClass)
        ?? this.getValveWeightByType('Ball valve (reduced bore)', boreMm, 300);
      if (vb != null) {
        trace.push('fallback-valve-ball-reduced-bore');
        return { weight: vb, trace };
      }
    }

    trace.push('unresolved-null-safe');
    return { weight: null, trace };
  }
}

export const masterTableService = new MasterTableService();
