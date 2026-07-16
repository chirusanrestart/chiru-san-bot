import yts from "yt-search";


export async function searchYoutube(query) {

    try {

        const result = await yts(query);


        if (!result.videos.length) {
            return null;
        }


        return result.videos[0];


    } catch (err) {

        console.log("Erro YouTube Search:", err);
        return null;

    }

}
