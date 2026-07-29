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
/* global _ app */

/* CommentsPanel - every comment thread as one list, in a tab
   of the navigation panel. The canvas section owns them. */

// A comment together with the replies written under it, in the
// order the comment list section holds them.
interface CommentThread {
  root: any;
  replies: any[];
}

class CommentsPanel {
  private map: any;
  private listNode: HTMLElement | null = null;
  private placeholderNode: HTMLElement | null = null;

  // The thread the user last picked, by the id of its first
  // comment. A rebuilt list keeps the mark on that row.
  private selectedId: string | null = null;

  // Whether the comments tab is the one on show. Rows are built
  // only while they can be seen; a change marks the list stale.
  private shown: boolean = false;
  private stale: boolean = true;

  constructor(map: any) {
    this.map = map;

    const panel = document.getElementById('comments-panel');
    if (panel) this.build(panel);

    // A comment added, removed or edited, and the full set that
    // arrives after a load or an undo.
    this.map.on('importannotations', this.markStale, this);
    this.map.on('insertannotation', this.markStale, this);
    this.map.on('deleteannotation', this.markStale, this);
    this.map.on('comment', this.markStale, this);
  }

  private build(panel: HTMLElement): void {
    panel.replaceChildren(
      <div class="comments-panel">
        <ul
          class="comments-panel-list"
          aria-label={_('Comments')}
          ref={(node: HTMLElement) => (this.listNode = node)}
        ></ul>
        <div
          class="comments-panel-placeholder"
          ref={(node: HTMLElement) => (this.placeholderNode = node)}
        >
          {_('This document has no comments.')}
        </div>
      </div>,
    );
  }

  // Called when the navigation panel switches tabs or closes.
  public setShown(shown: boolean): void {
    this.shown = shown;
    if (this.shown && this.stale) this.render();
  }

  private markStale(): void {
    this.stale = true;
    if (this.shown) this.render();
  }

  private getCommentSection(): any {
    if (!app.sectionContainer) return null;
    return app.sectionContainer.getSectionWithName(
      app.CSections.CommentList.name,
    );
  }

  private render(): void {
    if (!this.listNode || !this.placeholderNode) return;

    this.stale = false;

    const threads = this.collectThreads();
    const scrollTop = this.listNode.scrollTop;
    this.listNode.replaceChildren(
      ...threads.map((thread) => this.buildThreadRow(thread)),
    );
    this.listNode.scrollTop = scrollTop;
    this.placeholderNode.classList.toggle('hidden', threads.length > 0);
  }

  // The comments of the document, each with the replies under
  // it. A reply of a reply ends up under the same first one.
  private collectThreads(): CommentThread[] {
    const section = this.getCommentSection();
    if (!section) return [];

    const comments: any[] = section.sectionProperties.commentList;
    const threadOfId = new Map<string, CommentThread>();
    const threads: CommentThread[] = [];

    for (const comment of comments) {
      const data = comment.sectionProperties.data;
      // A comment with a tracked change belongs to track
      // changes, and one being written has nothing to show.
      if (data.trackchange || data.id === 'new') continue;

      const id = String(data.id);
      const parentId = String(data.parent);
      const parentThread = threadOfId.get(parentId);
      if (parentThread) {
        parentThread.replies.push(comment);
        // A reply can be replied to in turn, and the answer
        // belongs to the same thread.
        threadOfId.set(id, parentThread);
        continue;
      }

      // Either a comment that starts a thread, or a reply whose
      // parent is not in the list. Both start one.
      const thread: CommentThread = { root: comment, replies: [] };
      threads.push(thread);
      threadOfId.set(id, thread);
    }

    return threads;
  }

  private buildThreadRow(thread: CommentThread): HTMLElement {
    const data = thread.root.sectionProperties.data;
    const id = String(data.id);
    const color = this.authorColor(data.author);

    return (
      <li
        class={
          'comments-panel-thread' +
          (id === this.selectedId ? ' is-selected' : '')
        }
        data-comment-id={id}
      >
        <button
          class="comments-panel-thread-button"
          type="button"
          onClick={() => this.goToThread(thread)}
        >
          <span class="comments-panel-thread-head">
            <span
              class="comments-panel-thread-dot"
              style={color ? { backgroundColor: color } : {}}
            ></span>
            <span class="comments-panel-thread-author">{data.author}</span>
          </span>
          <span class="comments-panel-thread-text">
            {CommentsPanel.plainText(data)}
          </span>
          {this.buildThreadTags(thread)}
        </button>
      </li>
    );
  }

  // What a row says besides the words: when the thread was
  // started, how many replies it holds and whether resolved.
  private buildThreadTags(thread: CommentThread): HTMLElement {
    const data = thread.root.sectionProperties.data;
    const resolved = data.resolved === 'true';
    const replyCount = thread.replies.length;

    return (
      <span class="comments-panel-thread-tags">
        <span class="comments-panel-thread-date">
          {this.formatDate(data.dateTime)}
        </span>
        {replyCount > 0 && (
          <span class="comments-panel-thread-replies">
            {replyCount === 1
              ? replyCount + ' ' + _('reply')
              : replyCount + ' ' + _('replies')}
          </span>
        )}
        {resolved && (
          <span class="comments-panel-thread-resolved">{_('Resolved')}</span>
        )}
      </span>
    );
  }

  private goToThread(thread: CommentThread): void {
    const section = this.getCommentSection();
    if (!section) return;

    this.markSelectedRow(String(thread.root.sectionProperties.data.id));
    section.goToComment(thread.root);
  }

  private markSelectedRow(id: string): void {
    this.selectedId = id;
    if (!this.listNode) return;

    this.listNode
      .querySelectorAll<HTMLElement>('.comments-panel-thread')
      .forEach((row) => {
        row.classList.toggle('is-selected', row.dataset.commentId === id);
      });
  }

  // The words of a comment, without the markup they arrive in.
  // The parsed document never becomes part of the page.
  public static plainText(data: any): string {
    if (typeof data.text === 'string' && data.text.length > 0) return data.text;
    if (typeof data.html !== 'string' || data.html.length === 0) return '';

    const parsed = new DOMParser().parseFromString(data.html, 'text/html');
    const paragraphs = Array.from(parsed.body.children).map(
      (paragraph) => paragraph.textContent ?? '',
    );
    if (paragraphs.length === 0) return (parsed.body.textContent ?? '').trim();
    return paragraphs.join('\n').trim();
  }

  // The colour the document uses for this author. An author who
  // is not in the session has no colour of their own.
  private authorColor(author: string): string | null {
    const viewId = this.map.getViewId(author);
    if (typeof viewId !== 'number' || viewId < 0) return null;
    return app.LOUtil.rgbToHex(this.map.getViewColor(viewId));
  }

  private formatDate(dateTime: string): string {
    if (!dateTime) return '';

    // dateTime is already in UTC, so no Z is appended: that
    // would go wrong when the date is converted.
    const date = new Date(dateTime.replace(/,.*/, ''));
    if (isNaN(date.getTime())) return dateTime;

    return date.toLocaleDateString((String as any).locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
  }
}
