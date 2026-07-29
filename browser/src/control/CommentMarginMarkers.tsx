/* -*- js-indent-level: 8; fill-column: 100 -*- */
/*
 * Copyright the Collabora Online contributors.
 *
 * SPDX-License-Identifier: MPL-2.0
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
/* global _ app cool */

/*
 * CommentMarginMarkers - a small icon in the margin of the page for every place
 * in a Writer document that carries a comment.
 *
 * The comments themselves are read in the comments tab of the navigation panel.
 * The icon says where in the text a comment was written and takes the reader to
 * it: picking one opens that tab and marks the comment's row.
 *
 * The icons live in a layer of their own over the document view, beside the line
 * that joins a picked comment to the words it was written about. Their positions
 * are in the same measure as that line: pixels of the page as it is on screen,
 * counted from the top left corner of the canvas.
 */

// The comments one icon stands for.
//
// comments: the comments themselves, the one nearest the top of the page first.
//   Two comments share an icon when their icons would otherwise cover each
//   other, which is what happens when they were written on the same line, and a
//   reply always shares the icon of the comment it answers.
// x, y: where the icon goes, in pixels of the page as it is on screen.
// resolved: whether every comment behind the icon has been resolved.
interface CommentMarkerGroup {
  comments: any[];
  x: number;
  y: number;
  resolved: boolean;
}

class CommentMarginMarkers {
  // The size of an icon and the room left between it and the edge of the page,
  // both in pixels of the page as it is on screen.
  private static readonly iconSize = 22;
  private static readonly gapFromPageEdge = 4;

  private commentListSection: any;
  private containerNode: HTMLElement | null = null;

  // One button per icon, in the order the groups came in.
  private markerNodes: HTMLElement[] = [];

  // What the buttons were built from, so a pass that finds the same icons again
  // only moves them instead of building them anew.
  private builtFrom: string = '';

  // How wide an icon is, in pixels of the page as it is on screen.
  public static iconWidth(): number {
    return CommentMarginMarkers.iconSize;
  }

  constructor(commentListSection: any) {
    this.commentListSection = commentListSection;

    const documentContainer = document.getElementById('document-container');
    if (!documentContainer) return;

    this.containerNode = (
      <div id="comment-margin-markers" aria-hidden="false"></div>
    );
    documentContainer.appendChild(this.containerNode);
  }

  // Put an icon in the margin for each place of the document that carries a
  // comment, and take the icons that are no longer wanted away.
  public update(): void {
    if (!this.containerNode) return;

    const groups = this.collectGroups();

    const builtFrom = groups
      .map(
        (group) =>
          group.comments
            .map((comment: any) => comment.sectionProperties.data.id)
            .join(',') + (group.resolved ? '+' : ''),
      )
      .join(';');
    if (builtFrom !== this.builtFrom) {
      this.builtFrom = builtFrom;
      this.rebuild(groups);
    }

    for (let i = 0; i < groups.length; i++)
      this.markerNodes[i].style.transform =
        'translate(' + groups[i].x + 'px, ' + groups[i].y + 'px)';
  }

  // Where the icon that stands for a comment sits, in pixels of the page as it
  // is on screen, or null when the comment has no icon. The line that joins a
  // picked comment to the words it was written about ends here.
  public positionOfComment(id: string): number[] | null {
    for (const group of this.collectGroups())
      for (const comment of group.comments)
        if (String(comment.sectionProperties.data.id) === id)
          return [group.x, group.y];

    return null;
  }

  private rebuild(groups: CommentMarkerGroup[]): void {
    if (!this.containerNode) return;

    this.markerNodes = groups.map((group) => this.buildMarker(group));
    this.containerNode.replaceChildren(...this.markerNodes);
  }

  private buildMarker(group: CommentMarkerGroup): HTMLElement {
    const count = group.comments.length;

    return (
      <button
        class={
          'comment-margin-marker' +
          (count > 1 ? ' has-many' : '') +
          (group.resolved ? ' is-resolved' : '')
        }
        type="button"
        aria-label={CommentMarginMarkers.labelOf(group)}
        data-title={CommentMarginMarkers.labelOf(group)}
        onClick={(event: MouseEvent) => {
          event.stopPropagation();
          this.goToComment(group.comments[0]);
        }}
      >
        {count > 1 && (
          <span class="comment-margin-marker-count">{String(count)}</span>
        )}
        {group.resolved && CommentMarginMarkers.buildResolvedTick()}
      </button>
    );
  }

  // What an icon says to a reader who cannot see it.
  private static labelOf(group: CommentMarkerGroup): string {
    const count = group.comments.length;
    const author = group.comments[0].sectionProperties.data.author;

    if (count === 1)
      return group.resolved
        ? _('Go to resolved comment by {author}').replace('{author}', author)
        : _('Go to comment by {author}').replace('{author}', author);

    return group.resolved
      ? _('Go to {count} comments written here, all of them resolved').replace(
          '{count}',
          String(count),
        )
      : _('Go to {count} comments written here').replace(
          '{count}',
          String(count),
        );
  }

  // The tick that marks an icon whose comments have all been resolved. It is
  // drawn rather than fetched so that it takes its colours from the theme.
  private static buildResolvedTick(): HTMLElement {
    return (
      <span class="comment-margin-marker-resolved" aria-hidden="true">
        <svg viewBox="0 0 12 12" width="12" height="12">
          <circle class="comment-margin-marker-tick-disc" cx="6" cy="6" r="6" />
          <path class="comment-margin-marker-tick" d="M3 6.1 L5.2 8.3 L9 3.9" />
        </svg>
      </span>
    );
  }

  // Picking an icon takes the reader to the comment it stands for: the document
  // marks it, which draws the line from the icon to the words the comment was
  // written about, and the comments tab of the navigation panel comes up with
  // the comment's row marked.
  private goToComment(comment: any): void {
    const id = String(comment.sectionProperties.data.id);
    this.commentListSection.selectById(id);
    this.commentListSection.showCommentInCommentsPanel(id);
  }

  // The comments of the document gathered into the icons that stand for them.
  private collectGroups(): CommentMarkerGroup[] {
    const properties = this.commentListSection.sectionProperties;
    if (properties.show !== true) return [];

    const groups: CommentMarkerGroup[] = [];

    for (const comment of properties.commentList) {
      if (!this.hasAMarker(comment)) continue;

      const place = this.markerPlaceOf(comment);
      if (place === null) continue;

      // The comment goes with the icon above it when it answers one of the
      // comments behind that icon, or when the two icons would cover each other,
      // which is what happens to comments written on the same line. The comments
      // come in the order they appear in the document, so the icon to try is the
      // last one made.
      const last = groups.length > 0 ? groups[groups.length - 1] : null;
      if (last !== null && this.belongsWith(last, comment, place)) {
        last.comments.push(comment);
        last.resolved =
          last.resolved && comment.sectionProperties.data.resolved === 'true';
        continue;
      }

      groups.push({
        comments: [comment],
        x: place[0],
        y: place[1],
        resolved: comment.sectionProperties.data.resolved === 'true',
      });
    }

    return groups;
  }

  private belongsWith(
    group: CommentMarkerGroup,
    comment: any,
    place: number[],
  ): boolean {
    const parentId = String(comment.sectionProperties.data.parent);
    const answersTheGroup = group.comments.some(
      (held: any) => String(held.sectionProperties.data.id) === parentId,
    );
    if (answersTheGroup) return true;

    return (
      group.x === place[0] &&
      Math.abs(place[1] - group.y) < CommentMarginMarkers.iconSize
    );
  }

  // Whether a comment is one the reader can be sent to. A comment being written
  // has no place in the text yet, a comment that carries a tracked change
  // belongs to the track changes interface, and a resolved comment only has an
  // icon while the document is showing the resolved ones.
  private hasAMarker(comment: any): boolean {
    const data = comment.sectionProperties.data;
    if (data.id === 'new' || data.trackchange) return false;
    if (
      data.resolved === 'true' &&
      !this.commentListSection.sectionProperties.showResolved
    )
      return false;

    return true;
  }

  // Where the icon of a comment goes, in pixels of the page as it is on screen,
  // or null while the document has not said where the comment is anchored yet.
  private markerPlaceOf(comment: any): number[] | null {
    const data = comment.sectionProperties.data;
    if (!data.anchorPos) return null;

    if (!data.anchorSPoint)
      data.anchorSPoint = new cool.SimplePoint(
        data.anchorPos[0],
        data.anchorPos[1],
      );
    const anchor = data.anchorSPoint;

    const edge = CommentMarginMarkers.pageEdgeBesideComments(anchor);
    // A twip inside the page, so that the view layouts which work out which page
    // a point is on do not read a point on the boundary as the next page.
    const inside = new cool.SimplePoint(
      document.documentElement.dir === 'rtl' ? edge + 1 : edge - 1,
      anchor.y,
      anchor.part,
      anchor.mode,
    );

    const edgeX = inside.vX / app.dpiScale;
    const room =
      CommentMarginMarkers.gapFromPageEdge + CommentMarginMarkers.iconSize;

    return [
      Math.round(
        document.documentElement.dir === 'rtl'
          ? edgeX + CommentMarginMarkers.gapFromPageEdge
          : edgeX - room,
      ),
      Math.round(anchor.vY / app.dpiScale),
    ];
  }

  // The edge of the page that the comments sit beside, in twips of the document.
  // Writer sends the rectangle of every page with its status; before those
  // arrive the whole document stands in for the page.
  private static pageEdgeBesideComments(anchor: cool.SimplePoint): number {
    const rightToLeft = document.documentElement.dir === 'rtl';
    const pages = app.file.writer.pageRectangleList;

    let page: number[] | null = null;
    for (const candidate of pages) {
      if (anchor.y < candidate[1]) break;
      page = candidate;
      if (anchor.y <= candidate[1] + candidate[3]) break;
    }

    if (page === null)
      return rightToLeft || !app.activeDocument
        ? 0
        : app.activeDocument.fileSize.x;

    return rightToLeft ? page[0] : page[0] + page[2];
  }
}
