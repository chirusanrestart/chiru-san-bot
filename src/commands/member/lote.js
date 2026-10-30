import { startLote } from "../../services/loteCollector.js";

export default {
    name: "lote",
    description: "Processa até 100 imagens em lote usando a nuvem",
    async execute(sock, msg) {
        await startLote(sock, msg);
    }
};
