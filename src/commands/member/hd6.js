import { executeHDVariant } from "../../utils/hd-command.js";

export default {
    name: "hd6",
    description: "HD beleza com suavização leve",
    async execute(sock, msg) {
        await executeHDVariant(sock, msg, "beauty");
    }
};
