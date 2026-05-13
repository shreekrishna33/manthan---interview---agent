import fetch from 'node-fetch';

async function testApi() {
    console.log("Starting API Verification Test...");
    const baseUrl = 'http://127.0.0.1:5000';

    try {
        // 0. Health Check
        console.log("\n0. Health Check...");
        const healthRes = await fetch(`${baseUrl}/api/health`);
        const health = await healthRes.json();
        console.log("Health status:", health);

        // 1. Create a conversation
        console.log("\n1. Creating Conversation...");
        const createRes = await fetch(`${baseUrl}/api/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Verification Interview' })
        });

        if (!createRes.ok) {
            const errText = await createRes.text();
            throw new Error(`Create failed (${createRes.status}): ${errText.substring(0, 100)}`);
        }
        const conversation = await createRes.json();
        console.log("Created Conversation:", conversation);

        const convId = conversation.id;

        // 2. Verified Messages (Welcome Message)
        console.log("\n2. Checking Welcome Message...");
        const getRes = await fetch(`${baseUrl}/api/conversations/${convId}`);
        const data = await getRes.json();
        console.log("Messages in conversation:", data.messages.length);
        console.log("Welcome Message content (preview):", data.messages[0]?.content.substring(0, 50) + "...");

        // 3. Send Start Command
        console.log("\n3. Sending '/start technical'...");
        const sendRes = await fetch(`${baseUrl}/api/conversations/${convId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: '/start technical' })
        });

        if (!sendRes.ok) {
            const errText = await sendRes.text();
            throw new Error(`Send failed (${sendRes.statusCode}): ${errText.substring(0, 100)}`);
        }

        // Read stream
        console.log("Reading streaming response...");
        const reader = sendRes.body;
        let fullResponse = "";

        // Simple stream reader for Node.js fetch stream
        for await (const chunk of reader) {
            const textChunk = chunk.toString();
            const lines = textChunk.split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6);
                    try {
                        const data = JSON.parse(jsonStr);
                        if (data.content) {
                            process.stdout.write(data.content);
                            fullResponse += data.content;
                        }
                        if (data.done) console.log("\nStream finished.");
                    } catch (e) {
                        // Potential partial JSON or other lines
                    }
                }
            }
        }

        console.log("\nAI Response received length:", fullResponse.length);

        // 4. Check if reasoning tags are in the final saved message
        console.log("\n4. Verifying clean response in database...");
        const finalGetRes = await fetch(`${baseUrl}/api/conversations/${convId}`);
        const finalData = await finalGetRes.json();
        const lastMessage = finalData.messages[finalData.messages.length - 1];

        console.log("Last message role:", lastMessage.role);
        const hasReasoning = lastMessage.content.includes('<reasoning>');
        const hasXMLResponse = lastMessage.content.includes('<response>');
        console.log("Contains reasoning tags:", hasReasoning);
        console.log("Contains response tags:", hasXMLResponse);

        if (!hasReasoning && !hasXMLResponse) {
            console.log("SUCCESS: Backend correctly saved a clean response!");
        } else {
            console.error("FAILURE: Backend saved XML tags (reasoning or response).");
        }

        // 5. Respond to experience level (Interviewer Mode)
        console.log("\n5. Responding to experience level...");
        await sendMessage(baseUrl, convId, "I'm a mid-level web developer applying for a senior frontend position");

        // 6. Request a hint
        console.log("\n6. Testing /hint...");
        await sendMessage(baseUrl, convId, "/hint");

        // 7. Test Attender Mode
        console.log("\n7. Testing /mode attender...");
        await sendMessage(baseUrl, convId, "/mode attender");

        // 8. Test /trending
        console.log("\n8. Testing /trending (Attender Mode)...");
        await sendMessage(baseUrl, convId, "/trending");

        // 9. Test back to Interviewer
        console.log("\n9. Testing /mode interviewer...");
        await sendMessage(baseUrl, convId, "/mode interviewer");
        await sendMessage(baseUrl, convId, "Let's continue the interview");

    } catch (error) {
        console.error("Test failed:", error);
    }
}

async function sendMessage(baseUrl, convId, content) {
    console.log(`\nSending: "${content}"`);
    const sendRes = await fetch(`${baseUrl}/api/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
    });

    if (!sendRes.ok) throw new Error(`Send failed: ${sendRes.status}`);

    const reader = sendRes.body;
    let fullResponse = "";
    for await (const chunk of reader) {
        const textChunk = chunk.toString();
        const lines = textChunk.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonStr = line.substring(6);
                try {
                    const data = JSON.parse(jsonStr);
                    if (data.content) {
                        process.stdout.write(data.content);
                        fullResponse += data.content;
                    }
                } catch (e) { }
            }
        }
    }
    console.log("\n--- Response End ---");
    return fullResponse;
}

testApi();
