import EventEmitter from "node:events";
import RectBatcher from "./rectBatcher.js";
import * as rfb from "rfb2";

import { Mutex } from "async-mutex";
import { createCanvas, Canvas, CanvasRenderingContext2D, createImageData } from "canvas";

interface VMParams {
    vnc: {
        host: string,
        port: number
    },
    qmp: {
        port: number
    }
}

export default class VM extends EventEmitter {
    vnc?: rfb.RfbClient;
    vncHost: string;
    vncPort: number;
    vncOpen: boolean;
    vncErrorLevel: number;
    vncUpdateInterval?: NodeJS.Timeout;
    vncReconnectTimeout?: NodeJS.Timeout;
    
    framebuffer: Canvas;
    framebufferCtx: CanvasRenderingContext2D;

    rects: { height: number, width: number, x: number, y: number, data: Buffer }[];
    rectMutex: Mutex;

    constructor(params: VMParams) {
        super();

        this.framebuffer = createCanvas(1, 1);
        this.framebufferCtx = this.framebuffer.getContext("2d");

        this.vncOpen = false;
        this.vncErrorLevel = 0;
        this.vncPort = params.vnc.port;
        this.vncHost = params.vnc.host;

        this.rects = [];
        this.rectMutex = new Mutex();
    }

    private connectToVNC() {
        this.vnc = rfb.createConnection({
            host: this.vncHost,
            port: this.vncPort
        });

        this.vnc.on("close", () => this.vncClosed());
        this.vnc.on("connect", () => this.vncConnected());
        this.vnc.on("rect", (rect) => this.vncRect(rect));
        this.vnc.on("resize", (size) => this.updateSize({ width: size.width, height: size.height }));
    }

    private vncClosed() {
        this.vncOpen = false;
        this.vncErrorLevel++;

        if (this.vncErrorLevel > 4) {
            console.log("failed to connect to VNC after 5 attempts. quitting");
            process.exit(1);
        }

        try {
            this.vnc?.end();
        } catch {};

        console.log("failed to connect to vnc, retrying in 3 seconds");
        this.vncReconnectTimeout = setTimeout(() => this.connectToVNC(), 3000);
    }

    private vncConnected() {
        this.vncOpen = true;
        this.emit("vncConnected");
        console.log("connected to vnc.");

        this.updateSize({ width: this.vnc.width, height: this.vnc.height });
        this.vncUpdateInterval = setInterval(() => this.sendRects(), 5);
    }

    private vncRect(rect: any) {
        return this.rectMutex.runExclusive(async () => {
            return new Promise<void>(async (res, rej) => {
                let buffer = Buffer.alloc(rect.height * rect.width * 4);
                let offset = 0;

                for (let i = 0; i < rect.data.length; i += 4) {
                    buffer[offset++] = rect.data[i + 2];
                    buffer[offset++] = rect.data[i + 1];
                    buffer[offset++] = rect.data[i];
                    buffer[offset++] = 255;
                };

                const imageData = createImageData(Uint8ClampedArray.from(buffer), rect.width, rect.height);
                this.framebufferCtx.putImageData(imageData, rect.x, rect.y);

                this.rects.push({
                    x: rect.x,
                    y: rect.y,
                    height: rect.height,
                    width: rect.width,
                    data: buffer
                });

                if (!this.vnc) throw new Error();
                if (this.vncOpen) this.vnc.requestUpdate(true, 0, 0, this.vnc.height, this.vnc.width);

                res();
            });
        });
    }
    
    private updateSize(size: { width: number, height: number }) {
        if (this.framebuffer.width !== size.width) this.framebuffer.width = size.width;
        if (this.framebuffer.height !== size.height) this.framebuffer.height = size.height;

        this.emit("size", { width: size.width, height: size.height });
    }

    start() {
        return new Promise<void>(async (res, rej) => {
            this.connectToVNC();

            this.once("vncConnected", () => res());
        });
    }

    sendRects() {
        if (!this.vnc || this.rects.length < 1) return;

        return this.rectMutex.runExclusive(() => {
            return new Promise<void>(async (res, rej) => {
                const rect = await RectBatcher(this.framebuffer, [...this.rects]);
                this.rects = [];

                this.emit("dirtyrect", rect.data, rect.x, rect.y);
                res();
            });
        })
    }

    pointerEvent(x: number, y: number, mask: number) {
        if (!this.vnc) throw new Error();

        this.vnc.pointerEvent(x, y, mask);
    }

    keyEvent(keyCode: number, down: boolean) {
        if (!this.vnc) throw new Error();

        this.vnc.keyEvent(keyCode, down ? 1 : 0);
    }

    restoreVM() {
        throw new Error("Method not implemented.");
    }

    rebootVM() {
        throw new Error("Method not implemented.");
    }
}