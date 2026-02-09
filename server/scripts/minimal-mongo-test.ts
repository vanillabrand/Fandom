console.log("Start Static Import Test");
import { mongoService } from '../services/mongoService.js';
console.log("Imported MongoService");

async function run() {
    try {
        const uri = "mongodb://fake:27017/test";
        console.log("Connecting...");
        await mongoService.connect(uri).catch(e => console.error("Caught Connect Error:", e.message));
        console.log("Done");
    } catch (e) {
        console.error("Run Error:", e);
    }
}
run();
