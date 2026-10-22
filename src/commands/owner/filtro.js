import {
    FILTER_CATEGORIES,
    LOCKED_FILTER_CATEGORIES,
    getFilterSettings,
    updateFilterSettings
} from "../../services/filterSettings.js";

const CATEGORY_ALIASES = {
    "+18": "adulto",
    "18+": "adulto",
    adulto: "adulto",
    "conteudo adulto": "adulto",
    politica: "politica",
    religiao: "religiao",
    "humor negro": "humorNegro",
    "humor-negro": "humorNegro",
    humornegro: "humorNegro",
    nazismo: "nazismo",
    machismo: "machismo",
    catolicismo: "catolicismo",
    catolico: "catolicismo",
    ortodoxia: "ortodoxia",
    ortodoxo: "ortodoxia",
    assedio: "assedio",
    "assédio": "assedio"
};

function statusText(settings) {
    const lines = Object.entries(FILTER_CATEGORIES).map(([key, label]) => {
        const locked = LOCKED_FILTER_CATEGORIES.includes(key);
        const enabled = locked || (settings.enabled && settings.categories[key]);
        return `${enabled ? "🟢" : "🔴"} ${label}: ${enabled ? "ligado" : "desligado"}${locked ? " (permanente)" : ""}`;
    });

    return [
        "🔐 *Configuração dos filtros do Chiru-san*",
        `Filtro global: ${settings.enabled ? "🟢 ligado" : "🔴 desligado"}`,
        "🔒 Filtros permanentes: +18, assédio, machismo/ataques de gênero, nazismo e ataques contra católicos e cristãos ortodoxos.",
        ...lines,
        "",
        "Use *.filtro on/off* para os filtros configuráveis.",
        "Categorias configuráveis: *.filtro política on/off*, *.filtro religião on/off* e *.filtro humor-negro on/off*.",
        "Use *.filtro tudo on/off* para ligar/desligar todas as categorias configuráveis."
    ].join("\n");
}

export default {
    name: "filtro",
    aliases: ["filtros", "filtroseguranca"],
    category: "owner",
    ownerOnly: true,
    description: "Gerencia os filtros de conteúdo (somente dona)",
    async execute(sock, msg, args) {
        const from = msg.key.remoteJid;
        const input = (args || []).join(" ").trim().toLocaleLowerCase("pt-BR")
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const reply = async text => sock.sendMessage(from, { text }, { quoted: msg });

        if (!input || ["status", "estado", "ajuda", "help"].includes(input)) {
            return reply(statusText(getFilterSettings()));
        }

        if (["on", "ligar", "ativar"].includes(input)) {
            const settings = updateFilterSettings(state => { state.enabled = true; });
            return reply("🟢 Filtros configuráveis ligados. Os filtros permanentes continuam ativos.\n\n" + statusText(settings));
        }

        if (["off", "desligar", "desativar"].includes(input)) {
            const settings = updateFilterSettings(state => { state.enabled = false; });
            return reply("🔴 Filtros configuráveis desligados. Os filtros permanentes continuam ativos e as escolhas anteriores foram preservadas.\n\n" + statusText(settings));
        }

        const match = input.match(/^(.+?)\s+(on|off|ligar|desligar|ativar|desativar)$/);
        if (!match) {
            return reply("Uso: *.filtro status*, *.filtro on/off* ou *.filtro categoria on/off*.");
        }

        const categoryInput = match[1].trim();
        const action = match[2];
        const enabled = ["on", "ligar", "ativar"].includes(action);

        if (["tudo", "todas", "all"].includes(categoryInput)) {
            const settings = updateFilterSettings(state => {
                state.enabled = true;
                for (const key of Object.keys(state.categories)) {
                    state.categories[key] = LOCKED_FILTER_CATEGORIES.includes(key) ? true : enabled;
                }
            });
            const message = enabled
                ? "🟢 Todas as categorias foram ligadas."
                : "🔴 Todas as categorias configuráveis foram desligadas; os filtros permanentes continuam ativos.";
            return reply(message + "\n\n" + statusText(settings));
        }

        const category = CATEGORY_ALIASES[categoryInput];
        if (category && LOCKED_FILTER_CATEGORIES.includes(category) && !enabled) {
            return reply(`🔒 O filtro de ${FILTER_CATEGORIES[category]} é permanente e não pode ser desligado, nem pelo dono.`);
        }
        if (!category) {
            return reply("Categoria desconhecida. Opções configuráveis: política, religião e humor-negro. Os filtros de +18, assédio, machismo, nazismo e ataques contra católicos/ortodoxos são permanentes. Use *.filtro status* para ver o estado atual.");
        }

        const settings = updateFilterSettings(state => {
            state.enabled = true;
            state.categories[category] = enabled;
        });
        return reply(`${enabled ? "🟢" : "🔴"} Filtro de ${FILTER_CATEGORIES[category]} ${enabled ? "ligado" : "desligado"}.\n\n` + statusText(settings));
    }
};
