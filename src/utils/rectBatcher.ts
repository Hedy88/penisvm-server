import { Canvas, createCanvas, createImageData } from "canvas";

/**
 * bascially a function that gets dirty rects and then places them to the main framebuffer.
 * i can't be arsed to remake this so thanks cvm ts server
 * 
 * @author CollabVM 
 */
const RectBatcher = async (framebuffer: Canvas, rects: { height: number, width: number, x: number, y: number, data: Buffer }[]): Promise<{x: number, y: number, data: Canvas}> => {
    let mergedX = 0;
    let mergedY = 0;

    let mergedWidth = 0;
    let mergedHeight = 0;

    rects.forEach((rect) => {
        if (rect.x < mergedX) mergedX = rect.x;
        if (rect.y < mergedY) mergedY = rect.y;

        if (((rect.width + rect.x) - mergedX) > mergedWidth) mergedWidth = (rect.width + rect.x) - mergedX;
        if (((rect.height + rect.y) - mergedY) > mergedHeight) mergedHeight = (rect.height + rect.y) - mergedY; 
    });

    const rect = createCanvas(mergedWidth, mergedHeight);
    const rectCtx = rect.getContext("2d");

    rectCtx.drawImage(framebuffer, mergedX, mergedY, mergedWidth, mergedHeight, 0, 0, mergedWidth, mergedHeight);

    for (const rect of rects) {
        const id = createImageData(Uint8ClampedArray.from(rect.data), rect.width, rect.height);
        rectCtx.putImageData(id, rect.x - mergedX, rect.y - mergedY);
    }

    return {
        data: rect,
        x: mergedX,
        y: mergedY,
    };
};

export default RectBatcher;