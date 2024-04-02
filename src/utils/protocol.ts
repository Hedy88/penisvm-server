const penisProtocol = {
    image: 0,
    text: 1,
}

const encodeImage = (buffer: Buffer): Buffer => {
    const id = Buffer.from([penisProtocol.image]);
    const binary = Buffer.concat([id, buffer]);

    return binary;
};

const encodeText = (str: string): Buffer => {
    const text = new TextEncoder().encode(str);

    const id = Buffer.from([penisProtocol.text]);
    const buffer = Buffer.concat([id, text])

    return buffer;
};

export { encodeImage, encodeText };

