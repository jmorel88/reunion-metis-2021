precision highp float;

uniform sampler2D tMap;
uniform float uAlpha;

varying vec2 vUv;

void main() {
  vec4 tex2d = texture2D(tMap, vUv);
  if (tex2d.a < 0.1) discard;
  gl_FragColor = vec4(tex2d.rgb, uAlpha);
}