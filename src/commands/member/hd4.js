import { executeHDVariant } from "../../utils/hd-command.js";

export default {
    name: "hd4",
    description: "HD com cores mais vivas",
    async execute(sock, msg) {
        await executeHDVariant(sock, msg, "vivid");
    }
};
