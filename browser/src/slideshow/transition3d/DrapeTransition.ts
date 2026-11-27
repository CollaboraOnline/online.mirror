/* -*- js-indent-level: 8 -*- */

/*
 * Copyright the Collabora Office contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Drape transition: the entering slide comes down from the top over the static leaving slide, like
 * a sheet of cloth curled at its leading edge, showing its back where it is folded over. Once it
 * covers the leaving slide, it swings back once, hinged at its top edge, and settles.
 */

declare var SlideShow: any;

class DrapeTransitionImp extends SimpleTransition {
	// Distance of the eye from the slide, in units of half slide height.
	private static readonly eyeDistance = 4.0;
	// The sheet only bends from top to bottom, so it needs more rows than columns.
	private static readonly columns = 48;
	private static readonly rows = 192;
	// The leaving slide is a single quad at the start of the mesh.
	private static readonly leavingVertexCount = 6;

	// Set once the mesh is uploaded, which happens inside the base class constructor.
	private sheetVertexCount!: number;

	constructor(transitionParameters: TransitionParameters3D) {
		super(transitionParameters);
	}

	public override initWebglFlags(): void {
		if (this.context.isDisposed()) return;

		// The sheet is folded over itself, so its parts are sorted by depth.
		this.gl.enable(this.gl.DEPTH_TEST);
		this.gl.depthFunc(this.gl.LEQUAL);
		this.gl.disable(this.gl.CULL_FACE);
		this.gl.disable(this.gl.BLEND);
	}

	public override initBuffers(): void {
		if (this.sheetVertexCount) return;

		const vertexCount = this.uploadMesh(DrapeTransitionImp.buildMesh(), 2, [
			['a_texCoord', 2, 0],
		]);
		this.sheetVertexCount = vertexCount - DrapeTransitionImp.leavingVertexCount;
	}

	// A vertex is just its position on the slide, 0..1 from the top left corner: the vertex shader
	// works out where that point of the slide is during the transition.
	private static buildMesh(): Float32Array {
		const columns = DrapeTransitionImp.columns;
		const rows = DrapeTransitionImp.rows;
		const data: number[] = [];
		const pushQuad = (
			left: number,
			top: number,
			right: number,
			bottom: number,
		) => {
			// Two triangles, counter-clockwise on the screen while the slide is flat, so that the
			// fragment shader can tell the front and the back of the sheet apart.
			data.push(left, top, left, bottom, right, top);
			data.push(right, top, left, bottom, right, bottom);
		};

		pushQuad(0, 0, 1, 1);
		for (let row = 0; row < rows; ++row) {
			for (let column = 0; column < columns; ++column) {
				pushQuad(
					column / columns,
					row / rows,
					(column + 1) / columns,
					(row + 1) / rows,
				);
			}
		}
		return new Float32Array(data);
	}

	protected getVertexShader(): string {
		return SlideshowShaders['DrapeTransition.vert.glsl'];
	}

	protected getFragmentShader(): string {
		return SlideshowShaders['DrapeTransition.frag.glsl'];
	}

	// Draws one frame, called from render() on each requestAnimationFrame() tick. t is 0..1, which
	// render() also passes to the shaders as the time uniform.
	public override displaySlides_(t: number): void {
		const gl = this.gl;
		gl.uniform1f(
			gl.getUniformLocation(this.program, 'u_aspect'),
			this.context.canvas.width / this.context.canvas.height,
		);
		gl.uniform1f(
			gl.getUniformLocation(this.program, 'u_eyeDistance'),
			DrapeTransitionImp.eyeDistance,
		);
		gl.activeTexture(gl.TEXTURE0);
		gl.uniform1i(gl.getUniformLocation(this.program, 'slideTexture'), 0);
		const sheetLocation = gl.getUniformLocation(this.program, 'u_sheet');

		// The leaving slide is texture 0, flat in the background:
		gl.depthMask(false);
		gl.uniform1i(sheetLocation, 0);
		gl.bindTexture(gl.TEXTURE_2D, this.textures[0]);
		gl.drawArrays(gl.TRIANGLES, 0, DrapeTransitionImp.leavingVertexCount);

		// The entering slide is texture 1, the sheet in front of it:
		gl.depthMask(true);
		gl.uniform1i(sheetLocation, 1);
		gl.bindTexture(gl.TEXTURE_2D, this.textures[1]);
		gl.drawArrays(
			gl.TRIANGLES,
			DrapeTransitionImp.leavingVertexCount,
			this.sheetVertexCount,
		);
	}
}

function DrapeTransition(transitionParameters: TransitionParameters) {
	const newTransitionParameters: TransitionParameters3D = {
		...transitionParameters,
		leavingPrimitives: [],
		enteringPrimitives: [],
		allOperations: [],
	};

	return new DrapeTransitionImp(newTransitionParameters);
}

SlideShow.DrapeTransition = DrapeTransition;
