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

// A comment together with the replies under it. root starts it,
// replies read in order, depthOfId says how deep each is.
interface CommentThread {
  root: any;
  replies: any[];
  depthOfId: Map<string, number>;
}

// Which threads the list shows. A thread has to pass the words
// to look for, the authors, the status and the reply filter.
interface CommentFilters {
  search: string;
  authors: Set<string>;
  status: 'all' | 'unresolved' | 'resolved';
  onlyWithReplies: boolean;
}

// The order of the rows. 'position' is the order in the
// document; the rest read the date or the author's name.
type CommentSort = 'position' | 'newest' | 'oldest' | 'author';

class CommentsPanel {
  // How far a reply is stepped in from the comment it answers,
  // in pixels, and how many steps deep the stepping goes.
  private static readonly stepWidth = 14;
  private static readonly deepestStep = 4;

  private map: any;
  private listNode: HTMLElement | null = null;
  private placeholderNode: HTMLElement | null = null;
  private authorsNode: HTMLElement | null = null;
  private filterCountNode: HTMLElement | null = null;
  private filtersForm: HTMLFormElement | null = null;

  // The words of a comment, kept by the data object they were
  // read out of. A stale entry becomes unreachable on its own.
  private textOfData: WeakMap<object, { html: string; text: string }> =
    new WeakMap();

  private sortBy: CommentSort = 'position';

  private filters: CommentFilters = {
    search: '',
    authors: new Set<string>(),
    status: 'all',
    onlyWithReplies: false,
  };

  // The authors the filter offers, so the checkboxes are built
  // again only when the document has different ones.
  private offeredAuthors: string[] = [];

  // The comment the user last picked, by id. A rebuilt list
  // keeps the mark on that row.
  private selectedId: string | null = null;

  // The comments the user opened to read in full, by id. A
  // rebuilt list keeps the open ones open.
  private openedIds: Set<string> = new Set<string>();

  // The parts of each row as it stands, in the order the rows
  // are in. The measuring pass and the open control read them.
  private builtRows: Array<{
    id: string;
    textNode: HTMLElement;
    openNode: HTMLElement;
  }> = [];

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
        {this.buildSortRow()}
        {this.buildFilters()}
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

  private buildSortRow(): HTMLElement {
    return (
      <div class="comments-panel-sort">
        <label
          class="comments-panel-sort-label"
          for="comments-panel-sort-select"
        >
          {_('Sort by')}
        </label>
        <select
          id="comments-panel-sort-select"
          class="comments-panel-sort-select"
          onChange={(event: Event) => {
            this.sortBy = (event.target as HTMLSelectElement)
              .value as CommentSort;
            this.render();
          }}
        >
          <option value="position">{_('Position in document')}</option>
          <option value="newest">{_('Newest first')}</option>
          <option value="oldest">{_('Oldest first')}</option>
          <option value="author">{_('Author')}</option>
        </select>
      </div>
    );
  }

  // The controls that pick which threads the list shows, behind
  // a fold that starts closed.
  private buildFilters(): HTMLElement {
    return (
      <details class="comments-panel-filters">
        <summary class="comments-panel-filters-summary">
          <span class="comments-panel-filters-label">{_('Filters')}</span>
          <span
            class="comments-panel-filters-count hidden"
            ref={(node: HTMLElement) => (this.filterCountNode = node)}
          ></span>
          <span class="comments-panel-filters-arrow" aria-hidden="true"></span>
        </summary>
        <form
          class="comments-panel-filters-body"
          ref={(node: HTMLElement) =>
            (this.filtersForm = node as HTMLFormElement)
          }
          onSubmit={(event: Event) => event.preventDefault()}
        >
          <input
            class="comments-panel-filter-search"
            type="search"
            placeholder={_('Search comments...')}
            aria-label={_('Search comments')}
            onInput={(event: Event) => {
              this.filters.search = (event.target as HTMLInputElement).value;
              this.render();
            }}
          />
          <fieldset class="comments-panel-filter-group">
            <legend>{_('Status')}</legend>
            {this.buildStatusChoice('all', _('All'))}
            {this.buildStatusChoice('unresolved', _('Unresolved'))}
            {this.buildStatusChoice('resolved', _('Resolved'))}
          </fieldset>
          <label class="comments-panel-filter-check">
            <input
              class="comments-panel-filter-replies"
              type="checkbox"
              onChange={(event: Event) => {
                this.filters.onlyWithReplies = (
                  event.target as HTMLInputElement
                ).checked;
                this.render();
              }}
            />
            {_('Only threads with replies')}
          </label>
          <fieldset class="comments-panel-filter-group">
            <legend>{_('Author')}</legend>
            <div
              class="comments-panel-filter-authors"
              ref={(node: HTMLElement) => (this.authorsNode = node)}
            ></div>
          </fieldset>
          <button
            class="comments-panel-filters-clear button"
            type="button"
            onClick={() => this.clearFilters()}
          >
            {_('Clear filters')}
          </button>
        </form>
      </details>
    );
  }

  private buildStatusChoice(
    status: CommentFilters['status'],
    label: string,
  ): HTMLElement {
    return (
      <label class="comments-panel-filter-check">
        <input
          type="radio"
          name="comments-panel-status"
          value={status}
          checked={this.filters.status === status}
          onChange={() => {
            this.filters.status = status;
            this.render();
          }}
        />
        {label}
      </label>
    );
  }

  private buildAuthorChoice(author: string): HTMLElement {
    return (
      <label class="comments-panel-filter-check">
        <input
          type="checkbox"
          checked={this.filters.authors.has(author)}
          onChange={(event: Event) => {
            if ((event.target as HTMLInputElement).checked)
              this.filters.authors.add(author);
            else this.filters.authors.delete(author);
            this.render();
          }}
        />
        <span class="comments-panel-filter-author">{author}</span>
      </label>
    );
  }

  private clearFilters(): void {
    this.filters.search = '';
    this.filters.authors.clear();
    this.filters.status = 'all';
    this.filters.onlyWithReplies = false;

    // The controls carry their own state, and a form goes back
    // to what its fields were built with, so these are rebuilt.
    this.filtersForm?.reset();
    this.offeredAuthors = [];

    this.render();
  }

  // How many of the filters are narrowing the list.
  private activeFilterCount(): number {
    let count = 0;
    if (this.filters.search.trim().length > 0) count++;
    if (this.filters.authors.size > 0) count++;
    if (this.filters.status !== 'all') count++;
    if (this.filters.onlyWithReplies) count++;
    return count;
  }

  // Offer one checkbox per author who has written a comment. An
  // author the document lost loses the choice made on them.
  private updateAuthorFilter(threads: CommentThread[]): void {
    if (!this.authorsNode) return;

    const authors: string[] = [];
    for (const thread of threads) {
      for (const comment of [thread.root, ...thread.replies]) {
        const author = comment.sectionProperties.data.author;
        if (typeof author === 'string' && !authors.includes(author))
          authors.push(author);
      }
    }
    authors.sort((a, b) => a.localeCompare(b));

    const sameAuthors =
      authors.length === this.offeredAuthors.length &&
      authors.every((author, index) => author === this.offeredAuthors[index]);
    if (sameAuthors) return;

    for (const picked of Array.from(this.filters.authors))
      if (!authors.includes(picked)) this.filters.authors.delete(picked);

    this.offeredAuthors = authors;
    this.authorsNode.replaceChildren(
      ...authors.map((author) => this.buildAuthorChoice(author)),
    );
  }

  // Threads in the order the sort control asks for. Ties keep
  // the order they came in, which is the document order.
  private sortThreads(threads: CommentThread[]): CommentThread[] {
    if (this.sortBy === 'position') return threads;

    const inDocumentOrder = threads.map((thread, index) => ({
      thread: thread,
      index: index,
    }));

    inDocumentOrder.sort((left, right) => {
      const leftData = left.thread.root.sectionProperties.data;
      const rightData = right.thread.root.sectionProperties.data;

      let order = 0;
      if (this.sortBy === 'newest')
        order =
          CommentsPanel.timeOf(rightData) - CommentsPanel.timeOf(leftData);
      else if (this.sortBy === 'oldest')
        order =
          CommentsPanel.timeOf(leftData) - CommentsPanel.timeOf(rightData);
      else if (this.sortBy === 'author')
        order = String(leftData.author ?? '').localeCompare(
          String(rightData.author ?? ''),
        );

      return order || left.index - right.index;
    });

    return inDocumentOrder.map((entry) => entry.thread);
  }

  // When a comment was written, in milliseconds. A date that
  // cannot be read counts as the oldest there is.
  private static timeOf(data: any): number {
    const time = Date.parse(String(data.dateTime ?? '').replace(/,.*/, ''));
    return isNaN(time) ? 0 : time;
  }

  private matchesFilters(thread: CommentThread): boolean {
    const resolved = thread.root.sectionProperties.data.resolved === 'true';
    if (this.filters.status === 'resolved' && !resolved) return false;
    if (this.filters.status === 'unresolved' && resolved) return false;

    if (this.filters.onlyWithReplies && thread.replies.length === 0)
      return false;

    const comments = [thread.root, ...thread.replies];
    if (
      this.filters.authors.size > 0 &&
      !comments.some((comment) =>
        this.filters.authors.has(comment.sectionProperties.data.author),
      )
    )
      return false;

    const search = this.filters.search.trim().toLowerCase();
    if (
      search.length > 0 &&
      !comments.some((comment) =>
        this.plainTextOf(comment.sectionProperties.data)
          .toLowerCase()
          .includes(search),
      )
    )
      return false;

    return true;
  }

  // Called when the navigation panel switches tabs or closes.
  public setShown(shown: boolean): void {
    this.shown = shown;
    if (!this.shown) return;

    if (this.stale) this.render();
    // A row has no height while its tab is hidden, so the cut
    // comments can only be told once the tab is up.
    else
      app.layoutingService.appendLayoutingTask(() =>
        this.offerToOpenTheCutRows(),
      );
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
    this.updateAuthorFilter(threads);
    this.forgetOpenedCommentsThatAreGone(threads);
    const shown = this.sortThreads(
      threads.filter((thread) => this.matchesFilters(thread)),
    );

    const scrollTop = this.listNode.scrollTop;
    this.builtRows = [];
    this.listNode.replaceChildren(
      ...shown.map((thread) => this.buildThreadRow(thread)),
    );
    this.listNode.scrollTop = scrollTop;
    app.layoutingService.appendLayoutingTask(() =>
      this.offerToOpenTheCutRows(),
    );

    this.placeholderNode.textContent =
      threads.length === 0
        ? _('This document has no comments.')
        : _('No comment matches the filters.');
    this.placeholderNode.classList.toggle('hidden', shown.length > 0);

    if (this.filterCountNode) {
      const active = this.activeFilterCount();
      this.filterCountNode.textContent = active > 0 ? String(active) : '';
      this.filterCountNode.classList.toggle('hidden', active === 0);
    }
  }

  // The comments of the document, each with the replies under
  // it. A reply of a reply ends up under the same first one.
  private collectThreads(): CommentThread[] {
    const section = this.getCommentSection();
    if (!section) return [];

    // A comment with a tracked change belongs to track changes,
    // and one still being written has nothing to show yet.
    const comments: any[] = (
      section.sectionProperties.commentList as any[]
    ).filter((comment) => {
      const data = comment.sectionProperties.data;
      return !data.trackchange && data.id !== 'new';
    });

    const commentOfId = new Map<string, any>();
    for (const comment of comments)
      commentOfId.set(String(comment.sectionProperties.data.id), comment);

    // The comments that answer each comment, in the order the
    // document holds them.
    const answersOfId = new Map<string, any[]>();
    const roots: any[] = [];
    for (const comment of comments) {
      const root = CommentsPanel.rootOf(comment, commentOfId);
      if (comment === root) {
        roots.push(comment);
        continue;
      }
      const parentId = String(comment.sectionProperties.data.parent);
      const answers = answersOfId.get(parentId);
      if (answers) answers.push(comment);
      else answersOfId.set(parentId, [comment]);
    }

    const threads = roots.map((root) =>
      CommentsPanel.buildThread(root, answersOfId),
    );

    // A comment whose chain of parents closes on itself has no
    // first comment, so a thread starts at the comment itself.
    const held = new Set<string>();
    for (const thread of threads)
      for (const id of thread.depthOfId.keys()) held.add(id);
    for (const comment of comments) {
      const id = String(comment.sectionProperties.data.id);
      if (held.has(id)) continue;
      const thread = CommentsPanel.buildThread(comment, answersOfId);
      for (const heldId of thread.depthOfId.keys()) held.add(heldId);
      threads.push(thread);
    }

    return threads;
  }

  // Walk a thread from its first comment down, so every reply
  // lands after what it answers and carries its depth.
  private static buildThread(
    root: any,
    answersOfId: Map<string, any[]>,
  ): CommentThread {
    const thread: CommentThread = {
      root: root,
      replies: [],
      depthOfId: new Map<string, number>(),
    };
    thread.depthOfId.set(String(root.sectionProperties.data.id), 0);

    const collectAnswers = (comment: any, depth: number): void => {
      const id = String(comment.sectionProperties.data.id);
      for (const answer of answersOfId.get(id) ?? []) {
        const answerId = String(answer.sectionProperties.data.id);
        // A comment that is its own ancestor would send this
        // walk round for ever, so reaching one twice stops.
        if (thread.depthOfId.has(answerId)) continue;
        thread.depthOfId.set(answerId, depth + 1);
        thread.replies.push(answer);
        collectAnswers(answer, depth + 1);
      }
    };
    collectAnswers(root, 0);

    return thread;
  }

  // The comment a thread starts with, found by following each
  // parent up. A lost parent makes a thread of its own.
  private static rootOf(comment: any, commentOfId: Map<string, any>): any {
    const visited = new Set<string>();
    let current = comment;

    for (;;) {
      const data = current.sectionProperties.data;
      visited.add(String(data.id));

      const parentId = String(data.parent);
      if (parentId === '0' || visited.has(parentId)) return current;

      const parent = commentOfId.get(parentId);
      if (!parent) return current;
      current = parent;
    }
  }

  // A thread: the comment it starts with, then the replies under
  // it, each stepped in one level further than what it answers.
  private buildThreadRow(thread: CommentThread): HTMLElement {
    return (
      <li class="comments-panel-thread">
        {this.buildCommentRow(thread, thread.root)}
        {thread.replies.map((reply) => this.buildCommentRow(thread, reply))}
      </li>
    );
  }

  private buildCommentRow(thread: CommentThread, comment: any): HTMLElement {
    const data = comment.sectionProperties.data;
    const id = String(data.id);
    const opened = this.openedIds.has(id);
    const textId = 'comments-panel-text-' + id;
    const depth = thread.depthOfId.get(id) ?? 0;

    const textNode = (
      <span
        id={textId}
        class={
          'comments-panel-comment-text cool-dont-break' +
          (opened ? ' is-opened' : '')
        }
      >
        {this.plainTextOf(data)}
      </span>
    );

    const openNode = (
      <button
        class="comments-panel-comment-open hidden"
        type="button"
        aria-controls={textId}
        aria-expanded={String(opened)}
        onClick={() => this.toggleOpened(id)}
      >
        {CommentsPanel.openLabel(opened)}
      </button>
    );

    this.builtRows.push({ id: id, textNode: textNode, openNode: openNode });

    // Beyond this depth the steps would leave no room to read
    // in, so the deeper replies line up with the last step.
    const step = Math.min(depth, CommentsPanel.deepestStep);

    return (
      <div
        class={
          'comments-panel-comment' +
          (comment === thread.root ? ' is-first' : ' is-reply') +
          (id === this.selectedId ? ' is-selected' : '')
        }
        style={{ marginInlineStart: step * CommentsPanel.stepWidth + 'px' }}
        data-comment-id={id}
      >
        <button
          class="comments-panel-comment-button"
          type="button"
          onClick={() => this.goToComment(comment)}
        >
          <span class="comments-panel-comment-head">
            {this.buildAvatar(data)}
            <span class="comments-panel-comment-author">{data.author}</span>
          </span>
          {textNode}
        </button>
        <div class="comments-panel-comment-footer">
          {this.buildCommentTags(thread, comment)}
          {openNode}
        </div>
      </div>
    );
  }

  // What the control that opens a row says. Three dots stand for
  // the words the row is holding back.
  private static openLabel(opened: boolean): string {
    return opened ? _('Show less') : '...';
  }

  // Offer the open control on the rows whose comment does not
  // fit the three lines a row gives it.
  private offerToOpenTheCutRows(): void {
    for (const row of this.builtRows) {
      const cutShort = row.textNode.scrollHeight > row.textNode.clientHeight;
      row.openNode.classList.toggle(
        'hidden',
        !cutShort && !this.openedIds.has(row.id),
      );
    }
  }

  private toggleOpened(id: string): void {
    const opened = !this.openedIds.has(id);
    if (opened) this.openedIds.add(id);
    else this.openedIds.delete(id);

    for (const row of this.builtRows) {
      if (row.id !== id) continue;
      row.textNode.classList.toggle('is-opened', opened);
      row.openNode.textContent = CommentsPanel.openLabel(opened);
      row.openNode.setAttribute('aria-expanded', String(opened));
    }
  }

  // A comment the document no longer has is no longer open. One
  // a filter holds back keeps its state and comes back open.
  private forgetOpenedCommentsThatAreGone(threads: CommentThread[]): void {
    const present = new Set<string>();
    for (const thread of threads)
      for (const id of thread.depthOfId.keys()) present.add(id);

    for (const id of Array.from(this.openedIds))
      if (!present.has(id)) this.openedIds.delete(id);
  }

  // The picture of the author, in the round frame and the colour
  // of their view. A missing one falls back to a plain figure.
  private buildAvatar(data: any): HTMLElement {
    const image = (
      <img class="avatar-img" alt={data.author} />
    ) as HTMLImageElement;

    const hostAvatar = this.map['wopi']
      ? this.map['wopi'].CommentAvatarUrl
      : null;
    if (hostAvatar) image.setAttribute('src', hostAvatar);
    else if (data.avatar) image.setAttribute('src', data.avatar);
    else {
      app.LOUtil.setUserImage(image, this.map, this.map.getViewId(data.author));
      image.classList.add('comments-panel-comment-avatar-figure');
    }

    const color = this.authorColor(data.author);
    return (
      <span
        class="comments-panel-comment-avatar cool-annotation-img"
        style={color ? { borderColor: color } : {}}
      >
        {image}
      </span>
    );
  }

  // What a row says besides the words: when the comment was
  // written, whether it is resolved, and the reply count.
  private buildCommentTags(thread: CommentThread, comment: any): HTMLElement {
    const data = comment.sectionProperties.data;
    const resolved = data.resolved === 'true';
    const replyCount = comment === thread.root ? thread.replies.length : 0;

    return (
      <span class="comments-panel-comment-tags">
        <span class="comments-panel-comment-date cool-annotation-date">
          {this.formatDate(data.dateTime)}
        </span>
        {replyCount > 0 && (
          <span class="comments-panel-comment-replies">
            {replyCount === 1
              ? replyCount + ' ' + _('reply')
              : replyCount + ' ' + _('replies')}
          </span>
        )}
        {resolved && (
          <span class="comments-panel-comment-resolved cool-annotation-content-resolved">
            {_('Resolved')}
          </span>
        )}
      </span>
    );
  }

  private goToComment(comment: any): void {
    const section = this.getCommentSection();
    if (!section) return;

    this.markSelectedRow(String(comment.sectionProperties.data.id));
    section.goToComment(comment);
  }

  // Bring a comment's row up and mark it, for a reader who
  // reached the comment somewhere else. A filtered row waits.
  public showComment(id: string): void {
    if (this.stale) this.render();
    this.markSelectedRow(id);

    // The panel takes a moment to come up, and a row not on the
    // page yet cannot be scrolled to, so the scrolling waits.
    app.layoutingService.appendLayoutingTask(() => {
      this.listNode
        ?.querySelectorAll<HTMLElement>('.comments-panel-comment')
        .forEach((row) => {
          if (row.dataset.commentId === id)
            row.scrollIntoView({ block: 'nearest' });
        });
    });
  }

  private markSelectedRow(id: string): void {
    this.selectedId = id;
    if (!this.listNode) return;

    this.listNode
      .querySelectorAll<HTMLElement>('.comments-panel-comment')
      .forEach((row) => {
        row.classList.toggle('is-selected', row.dataset.commentId === id);
      });
  }

  private plainTextOf(data: any): string {
    const known = this.textOfData.get(data);
    if (known && known.html === data.html) return known.text;

    const text = CommentsPanel.plainText(data);
    this.textOfData.set(data, { html: data.html, text: text });
    return text;
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

    // The same fields the document writes under a comment on the
    // page.
    return date.toLocaleDateString((String as any).locale, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
  }
}
