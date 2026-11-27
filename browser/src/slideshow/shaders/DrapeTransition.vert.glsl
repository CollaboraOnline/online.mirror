#version 300 es
precision highp float;

#define M_PI 3.1415926535897932384626433832795

// The point on the slide: x from left to right and y from top to bottom, both 0..1.
in vec2 a_texCoord;

uniform float time;
uniform float u_aspect;
uniform float u_eyeDistance;
// False for the leaving slide, which stays flat, true for the entering slide, which is the sheet.
uniform bool u_sheet;

out vec2 v_texturePosition;
out vec3 v_normal;

// The parts of the effect, as fractions of the whole duration. Nothing moves until the descent
// starts, the sheet covers the leaving slide when the descent ends, and the swing back of the
// settle is at its largest at the peak.
const float descentStart = 0.30;
const float descentEnd = 0.55;
const float settlePeak = 0.69;

// The sheet bends at its leading edge: first tightly, around the curl, then in a wide arc, which
// takes the rest of the sheet up again, folded back towards the viewer. The radii are in units of
// half slide height, the angles say how far each bend turns.
const float curlRadius = 0.2;
const float curlAngle = 0.55 * M_PI;
const float foldRadius = 0.8;

float descent() {
	return clamp((time - descentStart) / (descentEnd - descentStart), 0.0, 1.0);
}

// The swing back of the sheet after it covered the leaving slide, 0..1: a single overshoot.
float settle() {
	return smoothstep(descentEnd, settlePeak, time) * (1.0 - smoothstep(settlePeak, 1.0, time));
}

// How much of the sheet hangs flat at its final place, measured from its top edge, for a column
// of the sheet.
float flatLength(float x) {
	float d = descent();
	// The leading edge speeds up as it falls. It starts out a bit lower on the left and lands
	// lower on the right, with a slight ripple like cloth. When the descent ends, the whole
	// sheet hangs flat, even on the left, where the tilt keeps it highest.
	float reach = 0.6 * d + 0.65 * d * d - 0.02 * (1.0 - d);
	float tilt = -0.06 + 0.5 * d * d;
	float ripple = 0.008 * sin(M_PI * d) * sin(2.0 * M_PI * (1.2 * x + 0.8 * d));
	return 2.0 * reach - curlRadius + tilt * (x - 0.5) + ripple;
}

// Where a point of the sheet hangs during the descent: flat at the top, then around the curl, and
// the rest is folded back over the flat part, showing the back of the sheet.
vec3 hang(vec2 point) {
	float x = (2.0 * point.x - 1.0) * u_aspect;
	// The distance from the top edge, measured along the sheet.
	float s = 2.0 * point.y;
	float flatPart = flatLength(point.x);
	if (s <= flatPart)
		return vec3(x, 1.0 - s, 0.0);

	// Each bend is part of a circle: a sheet that turned to the given angle went down by the sine
	// and towards the viewer by one minus the cosine of the angle, times the radius.
	vec2 curlStart = vec2(1.0 - flatPart, 0.0);
	float bent = s - flatPart;
	float angle = min(bent / curlRadius, curlAngle);
	vec2 yz = curlStart + curlRadius * vec2(-sin(angle), 1.0 - cos(angle));
	bent -= angle * curlRadius;

	float foldAngle = min(bent / foldRadius, M_PI - curlAngle);
	yz += foldRadius * vec2(sin(curlAngle) - sin(curlAngle + foldAngle),
	                        cos(curlAngle) - cos(curlAngle + foldAngle));
	bent -= foldAngle * foldRadius;

	// Once turned around, the sheet goes straight up.
	yz.x += bent;
	return vec3(x, yz);
}

vec3 sheetPosition(vec2 point) {
	vec3 position = hang(point);
	// Hinged at the top edge, the sheet swings back into the screen, the left side further. The
	// middle of the sheet leads at the start of the swing and lags behind at its end, like cloth.
	float bulge = 0.9 * sin(0.8 * M_PI * point.y);
	float straight = smoothstep(descentEnd, settlePeak, time) * (1.0 - 0.7 * smoothstep(settlePeak, 1.0, time));
	float swing = mix(bulge, point.y, straight);
	position.z -= settle() * swing * (0.62 - 0.38 * point.x);
	// Soft wrinkles, which show in the shading only. They are gone by the end.
	float wrinkle = 0.012 * step(descentStart, time) * (1.0 - smoothstep(descentEnd, 1.0, time));
	position.z += wrinkle * sin(5.0 * point.x + 3.0 * point.y + 2.0) * sin(4.0 * point.y - 2.5 * point.x);
	return position;
}

void main(void) {
	vec2 point = a_texCoord;
	vec3 position = vec3((2.0 * point.x - 1.0) * u_aspect, 1.0 - 2.0 * point.y, 0.0);
	vec3 normal = vec3(0.0, 0.0, 1.0);
	if (u_sheet) {
		// The normal of the front of the sheet, from two neighbouring points on the sheet.
		const float delta = 1.0 / 1024.0;
		position = sheetPosition(point);
		vec3 right = sheetPosition(point + vec2(delta, 0.0)) - position;
		vec3 down = sheetPosition(point + vec2(0.0, delta)) - position;
		normal = normalize(cross(down, right));
	}

	// Perspective projection, where the z = 0 plane fills the viewport. The x axis is in units of
	// half slide height, so that the curl is round.
	float w = (u_eyeDistance - position.z) / u_eyeDistance;
	float depth = clamp(-position.z / 20.0, -1.0, 1.0);
	gl_Position = vec4(position.x / u_aspect, position.y, depth * w, w);
	v_texturePosition = point;
	v_normal = normal;
}
