import React, { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { useStore } from '../../store/useStore';
import { OrbitControls, OrthographicCamera, PerspectiveCamera, GizmoHelper, GizmoViewport, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import { ViewCube } from '../components/ViewCube';

// Helper to draw the accumulated user geometry
const DrawnComponents = ({ pipes }) => {
    return (
        <group>
            {pipes.map((pipe, i) => {
                const ep1 = new THREE.Vector3(pipe.ep1.x, pipe.ep1.y, pipe.ep1.z);
                const ep2 = new THREE.Vector3(pipe.ep2.x, pipe.ep2.y, pipe.ep2.z);
                const dist = ep1.distanceTo(ep2);
                const mid = new THREE.Vector3().addVectors(ep1, ep2).multiplyScalar(0.5);

                const dir = ep2.clone().sub(ep1).normalize();
                const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

                if (pipe.type === 'BEND') {
                    return (
                        <group key={`dp-${i}`}>
                            <mesh position={mid} quaternion={quat}>
                                <cylinderGeometry args={[(pipe.bore/2)*1.1, (pipe.bore/2)*1.1, dist, 16]} />
                                <meshStandardMaterial color="#94a3b8" roughness={0.6} metalness={0.2} />
                            </mesh>
                        </group>
                    );
                }
                if (pipe.type === 'TEE') {
                    return (
                        <group key={`dp-${i}`}>
                            <mesh position={mid} quaternion={quat}>
                                <cylinderGeometry args={[pipe.bore/2, pipe.bore/2, dist, 8]} />
                                <meshStandardMaterial color="#94a3b8" roughness={0.6} metalness={0.2} />
                            </mesh>
                        </group>
                    );
                }
                if (pipe.type === 'FLANGE') {
                    return (
                        <group key={`dp-${i}`}>
                            <mesh position={mid} quaternion={quat}>
                                <cylinderGeometry args={[(pipe.bore/2)*1.6, (pipe.bore/2)*1.6, Math.max(dist*0.15, 10), 24]} />
                                <meshStandardMaterial color="#60a5fa" roughness={0.6} metalness={0.2} />
                            </mesh>
                        </group>
                    );
                }
                if (pipe.type === 'VALVE') {
                    return (
                        <group key={`dp-${i}`}>
                            <mesh position={mid} quaternion={quat}>
                                <boxGeometry args={[(pipe.bore/2)*2.2, dist, (pipe.bore/2)*2.2]} />
                                <meshStandardMaterial color="#3b82f6" roughness={0.6} metalness={0.2} />
                            </mesh>
                        </group>
                    );
                }

                return (
                    <group key={`dp-${i}`}>
                        <mesh position={mid} quaternion={quat}>
                            <cylinderGeometry args={[pipe.bore/2, pipe.bore/2, dist, 8]} />
                            <meshStandardMaterial color="#3b82f6" roughness={0.6} metalness={0.2} />
                        </mesh>
                    </group>
                );
            })}
        </group>
    );
};

const DrawTool = ({ activeTool, drawnPipes, setDrawnPipes }) => {
    const [startPt, setStartPt] = useState(null);
    const [currPt, setCurrPt] = useState(null);
    const snapResolution = 100;
    const defaultBore = 200;

    const handlePointerDown = (e) => {
        if (!['DRAW_PIPE', 'DRAW_BEND', 'DRAW_TEE', 'FLANGE', 'VALVE'].includes(activeTool)) return;
        e.stopPropagation();

        const x = Math.round(e.point.x / snapResolution) * snapResolution;
        const y = 0; // Lock to floor plane for now
        const z = Math.round(e.point.z / snapResolution) * snapResolution;

        const snappedPt = new THREE.Vector3(x, y, z);

        if (['DRAW_BEND', 'DRAW_TEE', 'FLANGE', 'VALVE'].includes(activeTool)) {
            // Instant placement for point-based components
            const typeMap = {
                'DRAW_BEND': 'BEND',
                'DRAW_TEE': 'TEE',
                'FLANGE': 'FLANGE',
                'VALVE': 'VALVE'
            };
            const len = typeMap[activeTool] === 'FLANGE' ? 50 : defaultBore * 1.5;
            // Fake direction along X for instant placement
            const ep2 = snappedPt.clone().add(new THREE.Vector3(len, 0, 0));
            setDrawnPipes([...drawnPipes, {
                type: typeMap[activeTool],
                bore: defaultBore,
                ep1: { x: snappedPt.x, y: snappedPt.y, z: snappedPt.z },
                ep2: { x: ep2.x, y: ep2.y, z: ep2.z }
            }]);
            return;
        }

        if (!startPt) {
            setStartPt(snappedPt);
            setCurrPt(snappedPt.clone());
        } else {
            if (snappedPt.distanceTo(startPt) > 0) {
                let actualStart = startPt;
                const defaultBendRadius = defaultBore * 1.5;

                let newComponents = [];

                // Simple auto-routing: check if we are changing direction relative to the last pipe drawn
                if (drawnPipes.length > 0 && activeTool === 'DRAW_PIPE') {
                    const lastComponent = drawnPipes[drawnPipes.length - 1];
                    if (lastComponent.type === 'PIPE') {
                        const lA = new THREE.Vector3(lastComponent.ep1.x, lastComponent.ep1.y, lastComponent.ep1.z);
                        const lB = new THREE.Vector3(lastComponent.ep2.x, lastComponent.ep2.y, lastComponent.ep2.z);

                        if (lB.distanceTo(startPt) < 1) {
                            const dir1 = lB.clone().sub(lA).normalize();
                            const dir2 = snappedPt.clone().sub(startPt).normalize();

                            // If direction changes, insert BEND
                            if (Math.abs(dir1.dot(dir2)) < 0.99) {
                                // Trim last pipe
                                const trimDist = defaultBendRadius;
                                const newLastEp2 = lB.clone().sub(dir1.clone().multiplyScalar(trimDist));

                                // Update last pipe in array
                                const updatedPipes = [...drawnPipes];
                                updatedPipes[updatedPipes.length - 1].ep2 = { x: newLastEp2.x, y: newLastEp2.y, z: newLastEp2.z };

                                // Create bend
                                const bendEp1 = newLastEp2;
                                const bendEp2 = startPt.clone().add(dir2.clone().multiplyScalar(trimDist));

                                newComponents.push({
                                    type: 'BEND',
                                    bore: defaultBore,
                                    ep1: { x: bendEp1.x, y: bendEp1.y, z: bendEp1.z },
                                    ep2: { x: bendEp2.x, y: bendEp2.y, z: bendEp2.z }
                                });

                                // New pipe starts after bend
                                actualStart = bendEp2;

                                setDrawnPipes([...updatedPipes, ...newComponents, {
                                    type: 'PIPE',
                                    bore: defaultBore,
                                    ep1: { x: actualStart.x, y: actualStart.y, z: actualStart.z },
                                    ep2: { x: snappedPt.x, y: snappedPt.y, z: snappedPt.z }
                                }]);

                                setStartPt(snappedPt);
                                return;
                            }
                        }
                    }
                }

                // Normal straight pipe append
                setDrawnPipes([...drawnPipes, {
                    type: 'PIPE',
                    bore: defaultBore,
                    ep1: { x: actualStart.x, y: actualStart.y, z: actualStart.z },
                    ep2: { x: snappedPt.x, y: snappedPt.y, z: snappedPt.z }
                }]);
            }

            // Continuous draw
            setStartPt(snappedPt);
        }
    };

    const handlePointerMove = (e) => {
        if (!startPt || activeTool !== 'DRAW_PIPE') return;

        const x = Math.round(e.point.x / snapResolution) * snapResolution;
        const y = 0;
        const z = Math.round(e.point.z / snapResolution) * snapResolution;

        // Ortho tracking helper - lock to major axes if moving mostly straight
        let p = new THREE.Vector3(x, y, z);
        const dx = Math.abs(p.x - startPt.x);
        const dz = Math.abs(p.z - startPt.z);

        if (dx > dz * 2) p.z = startPt.z;
        else if (dz > dx * 2) p.x = startPt.x;

        setCurrPt(p);
    };

    const handleContextMenu = (e) => {
        e.preventDefault();
        setStartPt(null);
        setCurrPt(null);
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setStartPt(null);
                setCurrPt(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <group>
            <mesh
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onContextMenu={handleContextMenu}
                rotation={[-Math.PI / 2, 0, 0]}
                position={[0, 0, 0]}
                renderOrder={-1}
            >
                <planeGeometry args={[100000, 100000]} />
                <meshBasicMaterial visible={false} />
            </mesh>

            {/* Preview Line */}
            {startPt && currPt && startPt.distanceTo(currPt) > 0 && (
                <group>
                    <Line points={[startPt, currPt]} color="#f59e0b" lineWidth={3} dashed />
                    <Text
                        position={[
                            (startPt.x + currPt.x) / 2,
                            200,
                            (startPt.z + currPt.z) / 2
                        ]}
                        color="#eab308"
                        fontSize={80}
                        outlineWidth={2}
                        outlineColor="#000"
                    >
                        {`${startPt.distanceTo(currPt).toFixed(0)}mm`}
                    </Text>
                </group>
            )}

            {/* Snap point indicator */}
            {currPt && activeTool === 'DRAW_PIPE' && (
                <mesh position={currPt}>
                    <sphereGeometry args={[15]} />
                    <meshBasicMaterial color="#3b82f6" />
                </mesh>
            )}
        </group>
    );
};

// Independent View Controls for Draw Canvas
const DrawCanvasControls = ({ orthoMode }) => {
    const { camera, gl } = useThree();

    useEffect(() => {
        const handleSetView = (e) => {
            const { viewType } = e.detail || {};
            const dist = orthoMode ? 10000 : 5000;
            switch(viewType) {
                case 'TOP': camera.position.set(0, dist, 0); camera.lookAt(0,0,0); break;
                case 'FRONT': camera.position.set(0, 0, dist); camera.lookAt(0,0,0); break;
                case 'RIGHT': camera.position.set(dist, 0, 0); camera.lookAt(0,0,0); break;
                case 'HOME':
                case 'ISO': camera.position.set(dist, dist, dist); camera.lookAt(0,0,0); break;
            }
        };
        window.addEventListener('draw-canvas-set-view', handleSetView);
        return () => window.removeEventListener('draw-canvas-set-view', handleSetView);
    }, [camera, orthoMode]);

    return null;
};

export function DrawCanvasTab() {
    const { setDrawMode, appSettings } = useStore();
    const [activeTool, setActiveTool] = useState('VIEW'); // 'VIEW' | 'DRAW_PIPE' | 'SELECT' | 'DRAW_BEND' ...
    const [drawnPipes, setDrawnPipes] = useState([]);
    const [isPanelOpen, setIsPanelOpen] = useState(true);
    const [isListOpen, setIsListOpen] = useState(true);
    const [localOrthoMode, setLocalOrthoMode] = useState(true);

    const controlsEnabled = activeTool === 'VIEW';

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] w-full overflow-hidden bg-slate-950 rounded-lg shadow-inner relative mt-[-2rem]">
            {/* Top Minimal Toolbar */}
            <div className="flex justify-between items-center px-4 py-2 bg-slate-900 border-b border-slate-700">
                <div className="flex items-center gap-4 text-slate-200 font-bold text-sm tracking-wide">
                    DRAW CANVAS
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setDrawMode(false)} className="text-slate-400 hover:text-white px-2 rounded">Minimize</button>
                    <button onClick={() => setDrawMode(false)} className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-xs font-bold transition-colors">Close</button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden relative">

                {/* Left Vertical Toolbar (48px wide) */}
                <div className="w-12 bg-slate-900 border-r border-slate-700 flex flex-col items-center py-2 gap-2 z-10 shrink-0">
                    <button className={`w-8 h-8 rounded flex items-center justify-center ${localOrthoMode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => setLocalOrthoMode(!localOrthoMode)} title="Toggle Ortho/Perspective">
                        <span className="font-bold text-xs uppercase">{localOrthoMode ? 'ORT' : 'PER'}</span>
                    </button>
                    <div className="w-6 h-px bg-slate-700 my-1"></div>
                    <button className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'VIEW' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => setActiveTool('VIEW')} title="Select (Orbit)">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l-7-7 7-7"/><path d="M19 12H5"/></svg>
                    </button>
                    <button className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'BOX_SELECT' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => setActiveTool('BOX_SELECT')} title="Box Select">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeDasharray="4 4" /></svg>
                    </button>
                    <div className="w-6 h-px bg-slate-700 my-1"></div>
                    <button className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'DRAW_PIPE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => setActiveTool('DRAW_PIPE')} title="Draw Pipe">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="2" y1="22" x2="22" y2="2"/></svg>
                    </button>
                    <button className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'DRAW_BEND' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => setActiveTool('DRAW_BEND')} title="Draw Bend">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 22h14a2 2 0 0 0 2-2V6l-3-4H6L3 6v14a2 2 0 0 0 2 2z"/></svg>
                    </button>
                    <button className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'DRAW_TEE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => setActiveTool('DRAW_TEE')} title="Draw Tee">
                        <span className="font-bold text-xs uppercase text-center w-full block">T</span>
                    </button>
                    <div className="w-6 h-px bg-slate-700 my-1"></div>
                    <button className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'FLANGE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => setActiveTool('FLANGE')} title="Flange">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
                    </button>
                    <button className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'VALVE' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => setActiveTool('VALVE')} title="Valve">
                         <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 3 21 21 21 3 3 21"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
                    </button>
                    <div className="w-6 h-px bg-slate-700 my-1"></div>
                    <button className={`w-8 h-8 rounded flex items-center justify-center ${activeTool === 'DELETE' ? 'bg-red-600 text-white' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => {
                        // Very simple delete last for demo
                        if (drawnPipes.length > 0) {
                            setDrawnPipes(drawnPipes.slice(0, -1));
                        }
                    }} title="Delete Last">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </div>

                {/* Main Canvas Area */}
                <div className="flex-1 relative bg-slate-950">
                    <Canvas
                        dpr={appSettings.limitPixelRatio ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio}
                        gl={{ antialias: !appSettings.disableAA }}
                    >
                        {localOrthoMode ? (
                            <OrthographicCamera makeDefault position={[5000, 5000, 5000]} zoom={0.2} near={0.1} far={500000} />
                        ) : (
                            <PerspectiveCamera makeDefault position={[5000, 5000, 5000]} fov={appSettings.cameraFov} near={appSettings.cameraNear || 1} far={appSettings.cameraFar || 500000} />
                        )}

                        <DrawCanvasControls orthoMode={localOrthoMode} />

                        <color attach="background" args={['#0d1117']} />
                        <ambientLight intensity={0.6} />
                        <directionalLight position={[1000, 1000, 500]} intensity={1.5} />

                        <gridHelper args={[100000, 100, '#3a4255', '#252a3a']} position={[0, -1, 0]} />
                        <axesHelper args={[500]} />

                        <DrawnComponents pipes={drawnPipes} />
                        <DrawTool activeTool={activeTool} drawnPipes={drawnPipes} setDrawnPipes={setDrawnPipes} />

                        <OrbitControls
                            enabled={controlsEnabled}
                            makeDefault
                            enableDamping
                            dampingFactor={0.1}
                            mouseButtons={{
                                LEFT: THREE.MOUSE.ROTATE,
                                MIDDLE: THREE.MOUSE.DOLLY,
                                RIGHT: THREE.MOUSE.PAN
                            }}
                        />

                        <ViewCube customEventName="draw-canvas-set-view" />
                        <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
                            <GizmoViewport axisColors={['#ef4444', '#10b981', '#3b82f6']} labelColor="white" />
                        </GizmoHelper>
                    </Canvas>

                    {/* Bottom Status Bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-8 bg-slate-900 border-t border-slate-700 flex items-center px-4 text-xs text-slate-400 justify-between">
                        <div className="flex gap-4">
                            <span>Tool: <strong>{activeTool.replace('_', ' ')}</strong></span>
                            <span>Snap: Grid+Endpoint</span>
                        </div>
                        <div className="flex gap-4">
                            <span>X: 0.0 Y: 0.0 Z: 0.0</span>
                            <span>Components: {drawnPipes.length}</span>
                        </div>
                    </div>
                </div>

                {/* Right Properties Panel (300px) */}
                {isPanelOpen && (
                    <div className="w-[300px] bg-slate-900 border-l border-slate-700 flex flex-col z-10 shrink-0">
                        <div className="flex justify-between items-center p-3 border-b border-slate-700 bg-slate-800">
                            <span className="font-bold text-xs text-slate-200">PROPERTIES</span>
                            <button onClick={() => setIsPanelOpen(false)} className="text-slate-400 hover:text-white">✕</button>
                        </div>
                        <div className="p-4 flex flex-col gap-4 overflow-y-auto">
                            <div className="text-slate-400 text-sm italic text-center">Select a component to edit its properties.</div>

                            {/* Dummy fields for mockup */}
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-slate-500 uppercase">Length (mm)</label>
                                <input type="text" className="bg-slate-950 border border-slate-700 rounded p-1 text-sm text-slate-200" disabled value="-" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-slate-500 uppercase">Bore (mm)</label>
                                <input type="text" className="bg-slate-950 border border-slate-700 rounded p-1 text-sm text-slate-200" disabled value="-" />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs text-slate-500 uppercase">Schedule</label>
                                <input type="text" className="bg-slate-950 border border-slate-700 rounded p-1 text-sm text-slate-200" disabled value="-" />
                            </div>
                        </div>
                    </div>
                )}
                {!isPanelOpen && (
                    <button onClick={() => setIsPanelOpen(true)} className="absolute right-0 top-1/2 bg-slate-800 text-slate-400 border border-r-0 border-slate-700 p-1 rounded-l z-20 hover:text-white hover:bg-slate-700">
                        ◀
                    </button>
                )}
            </div>

            {/* Bottom Component List (Collapsible, 150px) */}
            {isListOpen && (
                <div className="h-[150px] bg-slate-900 border-t border-slate-700 flex flex-col z-10 shrink-0 relative">
                    <div className="flex justify-between items-center px-4 py-1 bg-slate-800 border-b border-slate-700">
                        <span className="font-bold text-xs text-slate-200">COMPONENT LIST</span>
                        <button onClick={() => setIsListOpen(false)} className="text-slate-400 hover:text-white text-xs">▼ Hide</button>
                    </div>
                    <div className="flex-1 overflow-auto bg-slate-950 p-2">
                        <table className="w-full text-left text-xs text-slate-400 border-collapse">
                            <thead>
                                <tr className="border-b border-slate-800">
                                    <th className="py-1 px-2 font-medium">#</th>
                                    <th className="py-1 px-2 font-medium">Type</th>
                                    <th className="py-1 px-2 font-medium">Length</th>
                                    <th className="py-1 px-2 font-medium">Bore</th>
                                    <th className="py-1 px-2 font-medium">EP1</th>
                                    <th className="py-1 px-2 font-medium">EP2</th>
                                </tr>
                            </thead>
                            <tbody>
                                {drawnPipes.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="py-4 text-center text-slate-600 italic">No components drawn yet.</td>
                                    </tr>
                                ) : (
                                    drawnPipes.map((p, i) => (
                                        <tr key={i} className="border-b border-slate-800 hover:bg-slate-900">
                                            <td className="py-1 px-2">{i+1}</td>
                                            <td className="py-1 px-2 text-blue-400 font-bold">{p.type}</td>
                                            <td className="py-1 px-2">
                                                {p.type === 'PIPE'
                                                    ? new THREE.Vector3(p.ep1.x, p.ep1.y, p.ep1.z).distanceTo(new THREE.Vector3(p.ep2.x, p.ep2.y, p.ep2.z)).toFixed(1)
                                                    : '-'
                                                }
                                            </td>
                                            <td className="py-1 px-2">
                                                <input
                                                    type="number"
                                                    value={p.bore}
                                                    onChange={(e) => {
                                                        const newVal = parseFloat(e.target.value) || 0;
                                                        const newPipes = [...drawnPipes];
                                                        newPipes[i] = { ...newPipes[i], bore: newVal };
                                                        setDrawnPipes(newPipes);
                                                    }}
                                                    className="w-16 bg-slate-950 border border-slate-700 px-1 py-0.5 rounded text-slate-300 outline-none focus:border-blue-500"
                                                />
                                            </td>
                                            <td className="py-1 px-2 truncate max-w-[100px]">{`[${p.ep1.x.toFixed(0)}, ${p.ep1.y.toFixed(0)}, ${p.ep1.z.toFixed(0)}]`}</td>
                                            <td className="py-1 px-2 truncate max-w-[100px]">{`[${p.ep2.x.toFixed(0)}, ${p.ep2.y.toFixed(0)}, ${p.ep2.z.toFixed(0)}]`}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {!isListOpen && (
                <button onClick={() => setIsListOpen(true)} className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-slate-800 text-slate-400 border border-b-0 border-slate-700 px-4 py-1 rounded-t z-20 hover:text-white hover:bg-slate-700 text-xs font-bold shadow-lg">
                    ▲ SHOW COMPONENT LIST
                </button>
            )}
        </div>
    );
}
