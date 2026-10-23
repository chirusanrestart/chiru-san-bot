// Desativado: filtro de conteúdo removido para permitir respostas sem bloqueios.
export const LOCKED_FILTER_CATEGORIES = Object.freeze([]);
export const FILTER_CATEGORIES = Object.freeze({});

export function getFilterSettings() {
    return { enabled: true, categories: {} };
}

export function isFilterEnabled() {
    return true;
}

export function updateFilterSettings(mutator) {
    const state = getFilterSettings();
    if (typeof mutator === "function") {
        mutator(state);
    }
    return state;
}
