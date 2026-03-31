import { dbg } from '../utils/debugGate';

export const initialState = {
    drawnPipes: [],
    selectedIndex: null,
    multiSelectedIndices: [],
    hiddenIndices: [],
    activeTool: 'VIEW',
};

export function drawCanvasReducer(state, action) {
    switch (action.type) {
        case 'ADD_COMPONENT':
            dbg.state('DRAW_REDUCER', 'ADD_COMPONENT', { type: action.payload.type });
            return {
                ...state,
                drawnPipes: [...state.drawnPipes, action.payload]
            };
        case 'DELETE_LAST':
            dbg.state('DRAW_REDUCER', 'DELETE_LAST');
            if (state.drawnPipes.length === 0) return state;
            return {
                ...state,
                drawnPipes: state.drawnPipes.slice(0, -1),
                selectedIndex: state.selectedIndex === state.drawnPipes.length - 1 ? null : state.selectedIndex
            };
        case 'UNDO':
            dbg.state('DRAW_REDUCER', 'UNDO');
            if (state.drawnPipes.length === 0) return state;
            return {
                ...state,
                drawnPipes: state.drawnPipes.slice(0, -1),
                selectedIndex: state.selectedIndex === state.drawnPipes.length - 1 ? null : state.selectedIndex
            };
        case 'SELECT':
            dbg.state('DRAW_REDUCER', 'SELECT', { index: action.payload });
            return {
                ...state,
                selectedIndex: action.payload,
                multiSelectedIndices: action.payload !== null ? [action.payload] : []
            };
        case 'TOGGLE_SELECT':
            dbg.state('DRAW_REDUCER', 'TOGGLE_SELECT', { index: action.payload });
            let newMulti = [...state.multiSelectedIndices];
            if (newMulti.includes(action.payload)) {
                newMulti = newMulti.filter(i => i !== action.payload);
            } else {
                newMulti.push(action.payload);
            }
            return {
                ...state,
                multiSelectedIndices: newMulti,
                selectedIndex: newMulti.length > 0 ? newMulti[newMulti.length - 1] : null
            };
        case 'HIDE_SELECTED':
            dbg.state('DRAW_REDUCER', 'HIDE_SELECTED', { count: state.multiSelectedIndices.length });
            return {
                ...state,
                hiddenIndices: [...new Set([...state.hiddenIndices, ...state.multiSelectedIndices])],
                multiSelectedIndices: [],
                selectedIndex: null
            };
        case 'UNHIDE_ALL':
            dbg.state('DRAW_REDUCER', 'UNHIDE_ALL');
            return {
                ...state,
                hiddenIndices: []
            };
        case 'SET_TOOL':
            dbg.state('DRAW_REDUCER', 'SET_TOOL', { tool: action.payload });
            return {
                ...state,
                activeTool: action.payload
            };
        case 'UPDATE_COMPONENT':
            dbg.state('DRAW_REDUCER', 'UPDATE_COMPONENT', { index: action.payload.index });
            const updatedPipes = [...state.drawnPipes];
            updatedPipes[action.payload.index] = action.payload.component;
            return {
                ...state,
                drawnPipes: updatedPipes
            };
        case 'SET_ALL_COMPONENTS':
            dbg.state('DRAW_REDUCER', 'SET_ALL_COMPONENTS', { count: action.payload.length });
            return {
                ...state,
                drawnPipes: action.payload,
                selectedIndex: null
            };
        case 'DELETE_SELECTED':
            if (state.multiSelectedIndices.length === 0 && state.selectedIndex === null) return state;

            const toDelete = state.multiSelectedIndices.length > 0 ? state.multiSelectedIndices : [state.selectedIndex];
            dbg.state('DRAW_REDUCER', 'DELETE_SELECTED', { count: toDelete.length });

            const newPipes = state.drawnPipes.filter((_, i) => !toDelete.includes(i));

            return {
                ...state,
                drawnPipes: newPipes,
                selectedIndex: null,
                multiSelectedIndices: []
            };
        default:
            return state;
    }
}
