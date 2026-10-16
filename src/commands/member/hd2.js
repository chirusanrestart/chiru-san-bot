import { executeHDVariant } from "../../utils/hd-command.js";

export default {
    name: "hd2",
    description: "HD para anime e ilustrações",
    async execute(sock, msg) {
        await executeHDVariant(sock, msg, "anime");
    }
};
