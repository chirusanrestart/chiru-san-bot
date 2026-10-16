import { executeHDVariant } from "../../utils/hd-command.js";

export default {
    name: "hd5",
    description: "HD natural para fotos comuns",
    async execute(sock, msg) {
        await executeHDVariant(sock, msg, "natural");
    }
};
