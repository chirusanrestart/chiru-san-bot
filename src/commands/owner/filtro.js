import {
    FILTER_CATEGORIES,
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
    nazismo: "nazismo"
};

function statusText(settings) {
    const lines = Object.entries(FILTER_CATEGORIES).map(([key, label]) => {
        const enabled = key === "adulto"
            ? settings.categories.adulto !== false
            : settings.enabled && settings.categories[key];
        return `${enabled ? "🟢" : "🔴"} ${label}: ${enabled ? "ligado" : "desligado"}`;
    });

    return [
        "🔐 *Configuração dos filtros do Chiru-san*",
        `Filtro global: ${settings.enabled ? "🟢 ligado" : "🔴 desligado"}`,
        "🔒 O filtro de conteúdo +18 permanece sempre ligado por segurança.",
        ...lines,
        "",
        "Use *.filtro on/off* para o filtro global.",
        "Use *.filtro +18 on/off*, *.filtro nazismo on/off*, *.filtro política on/off*, *.filtro religião on/off* ou *.filtro humor-negro on/off*.",
        "Use *.filtro tudo on/off* para ligar/desligar todas as categorias."
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
            return reply("🟢 Filtro global ligado.\n\n" + statusText(settings));
        }

        if (["off", "desligar", "desativar"].includes(input)) {
            const settings = updateFilterSettings(state => { state.enabled = false; });
            return reply("🔴 Filtro global desligado. As categorias foram preservadas para quando você ligar novamente.\n\n" + statusText(settings));
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
                for (const key of Object.keys(state.categories)) state.categories[key] = enabled;
            });
            return reply(`${enabled ? "🟢 Todas as categorias foram ligadas." : "🔴 Todas as categorias foram desligadas."}\n\n` + statusText(settings));
        }

        const category = CATEGORY_ALIASES[categoryInput];
        if (category === "adulto" && !enabled) {
            return reply("🔒 O filtro de conteúdo +18 não pode ser desligado. As outras categorias continuam configuráveis.");
        }
        if (!category) {
            return reply("Categoria desconhecida. Opções: +18, política, religião, humor-negro e nazismo. Use *.filtro status* para ver o estado atual.");
        }

        const settings = updateFilterSettings(state => {
            state.enabled = true;
            state.categories[category] = enabled;
        });
        return reply(`${enabled ? "🟢" : "🔴"} Filtro de ${FILTER_CATEGORIES[category]} ${enabled ? "ligado" : "desligado"}.\n\n` + statusText(settings));
    }
};
