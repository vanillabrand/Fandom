
import fs from 'fs';
import path from 'path';

async function testFetch() {
    // URL taken from previous test_output_metadata.txt
    const url = "https://scontent-iad3-2.cdninstagram.com/v/t51.2885-15/494551227_18502407373015227_8324157592813446032_n.jpg?stp=dst-jpg_e35_p1080x1080_sh0.08_tt6&_nc_ht=scontent-iad3-2.cdninstagram.com&_nc_cat=103&_nc_oc=Q6cZ2QGbRz9uDkd_ZNh83wIjGfVEVSTZ9IVs9b07j1zoLmPUW7zF25naoMCLg2kCfcvWW0k&_nc_ohc=yf8WFq21_ZIQ7kNvwFcXoE9&_nc_gid=5OBl_V4hr9FP3MWykDrEOA&edm=APs17CUBAAAA&ccb=7-5&oh=00_AfkUn0lVnSBMFmYbf2ViTLVm4lTI7FlCBZMQJM0NiHlA6g&oe=694E1D38&_nc_sid=10d13b";

    console.log("Attempting to fetch:", url);

    try {
        const res = await fetch(url);
        console.log("Status:", res.status, res.statusText);

        if (res.ok) {
            const buffer = await res.arrayBuffer();
            console.log("Success! Downloaded bytes:", buffer.byteLength);
            fs.writeFileSync('test_image.jpg', Buffer.from(buffer));
            console.log("Saved to test_image.jpg");
        } else {
            console.error("Failed to fetch image");
        }
    } catch (e) {
        console.error("Fetch error:", e);
    }
}

testFetch();
