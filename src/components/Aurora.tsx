// @ts-nocheck
import { useEffect, useRef } from 'react';
import { Renderer, Program, Mesh, Color, Triangle } from 'ogl';

interface AuroraProps {
    colorStops?: string[];
    amplitude?: number;
    blend?: number;
    speed?: number;
}

const Aurora = ({
    colorStops = ["#3730a3", "#7e22ce", "#4338ca"],
    amplitude = 1.0,
    blend = 0.5,
    speed = 1.0,
}: AuroraProps) => {
    const ctnDom = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const ctn = ctnDom.current;
        if (!ctn) return;

        const renderer = new Renderer({ alpha: true });
        const gl = renderer.gl;
        gl.clearColor(0, 0, 0, 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.canvas.style.position = "absolute";
        gl.canvas.style.top = "0";
        gl.canvas.style.left = "0";
        gl.canvas.style.width = "100%";
        gl.canvas.style.height = "100%";
        ctn.appendChild(gl.canvas);

        const scene = new Mesh(gl, { geometry: new Triangle(gl), program: new Program(gl, { vertex: `\n          attribute vec2 uv;\n          attribute vec3 position;\n          varying vec2 vUv;\n          void main() {\n            vUv = uv;\n            gl_Position = vec4(position, 1.0);\n          }\n        `, fragment: `\n          precision mediump float;\n          varying vec2 vUv;\n          uniform float uTime;\n          uniform float uAmplitude;\n          uniform vec3 uColorStops[3];\n          uniform float uBlend;\n          vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }\n          float snoise(vec2 v){\n            const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);\n            vec2 i  = floor(v + dot(v, C.yy));\n            vec2 x0 = v - i + dot(i, C.xx);\n            vec2 i1;\n            i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);\n            vec4 x12 = x0.xyxy + C.xxzz;\n            x12.xy -= i1;\n            i = mod(i, 289.0);\n            vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));\n            vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);\n            m = m * m;\n            m = m * m;\n            vec3 x = 2.0 * fract(p * C.www) - 1.0;\n            vec3 h = abs(x) - 0.5;\n            vec3 ox = floor(x + 0.5);\n            vec3 a0 = x - ox;\n            m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);\n            vec3 g;\n            g.x  = a0.x * x0.x + h.x * x0.y;\n            g.yz = a0.yz * x12.xz + h.yz * x12.yw;\n            return 130.0 * dot(m, g);\n          }\n          void main() {\n            vec2 uv = vUv;\n            float t = uTime * 0.02 * ${speed.toFixed(1)};\n            float noise = snoise(vec2(uv.x * 2.0 + t, uv.y * 2.0 + t)) * uAmplitude;\n            vec3 color = mix(uColorStops[0], uColorStops[1], uv.x + noise * 0.3);\n            color = mix(color, uColorStops[2], uv.y * 0.5 + noise * 0.2);\n            float alpha = smoothstep(0.0, 1.0, (uv.y + noise) * uBlend);\n            gl_FragColor = vec4(color, alpha * 0.6);\n          }\n        `, uniforms: { uTime: { value: 0 }, uAmplitude: { value: amplitude }, uColorStops: { value: colorStops.map(c => { const col = new Color(); col.set(c); return [col.r, col.g, col.b]; }) }, uBlend: { value: blend } } }) });

        let animateId: number;
        const update = (t: number) => {
            animateId = requestAnimationFrame(update);
            (scene.program.uniforms.uTime.value = t * 0.001 * speed);
            renderer.render({ scene });
        };
        animateId = requestAnimationFrame(update);

        const resize = () => {
            if (!ctn) return;
            renderer.setSize(ctn.clientWidth, ctn.clientHeight);
        };
        resize();
        window.addEventListener('resize', resize);

        return () => {
            cancelAnimationFrame(animateId);
            window.removeEventListener('resize', resize);
            if (ctn && gl.canvas.parentNode === ctn) {
                ctn.removeChild(gl.canvas);
            }
            gl.getExtension('WEBGL_lose_context')?.loseContext();
        };
    }, [amplitude, blend, colorStops, speed]);

    return <div ref={ctnDom} className="w-full h-full" />;
};

export default Aurora;
