import { createAnimator, EasingType, KeyFrameConfig } from "@gp/keyframe-animator";

const tweenStartReel: KeyFrameConfig<{
    y: number;
}>[] =  [
    {
        t: 0,
        data: { "y": 50 },
        easing: EasingType.EaseOutQuad,
    },
    {
        t: 400,
        data: { "y": -50 },
        easing: EasingType.EaseOutQuad,
    },
    {
        t: 550,
        data: { "y": 50 },
        easing: EasingType.EaseInQuad,
    },
];

const tweenEndReel: KeyFrameConfig<{
    y: number;
}>[] =  [
    {
        t: 0,
        data: { "y": 50 },
        easing: EasingType.EaseOutCirc,
    },
    {
        t: 200,
        data: { "y": 120 },
        easing: EasingType.EaseOutCirc,
    },
    {
        t: 500,
        data: { "y": 50 },
        easing: EasingType.EaseOutExpo,
    }
];


export function tweenInOutReel(startReel: boolean, loopCallback: (data: any) => void, completeCallback: () => void): Promise<void> {
    const animData = startReel ? tweenStartReel : tweenEndReel;
    return createAnimator({
        keyFrames: animData,
        loopFunction: (s) => {
            loopCallback?.(s);
        },
    }).playAsync(1).then(() => {
        completeCallback?.();
    });
}