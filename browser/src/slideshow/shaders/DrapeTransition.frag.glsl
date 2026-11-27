#version 300 es
precision mediump float;

uniform sampler2D slideTexture;

in vec2 v_texturePosition;
in vec3 v_normal;

out vec4 outColor;

void main() {
	// Light from the viewer, a little from the upper left. The light is relative to that of a flat
	// slide, so the sheet has exactly the colors of the slide once it lies flat.
	const float ambient = 0.4;
	vec3 lightVector = normalize(vec3(-0.05, 0.1, 1.0));
	vec3 normal = normalize(v_normal);
	// Where the sheet is folded over, its back faces the viewer.
	if (!gl_FrontFacing)
		normal = -normal;
	float light = ambient + (1.0 - ambient) * max(dot(lightVector, normal), 0.0) / lightVector.z;
	vec4 fragment = texture(slideTexture, v_texturePosition);
	outColor = vec4(min(fragment.rgb * light, 1.0), 1.0);
}
