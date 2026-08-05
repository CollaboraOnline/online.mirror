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

// What the order of the rows is read from: the place in the
// document, the date, or the name of the author.
type CommentSortKey = 'position' | 'date' | 'author';

class CommentsPanel {
  // How far a reply is stepped in from the comment it answers,
  // in pixels, and how many steps deep the stepping goes.
  private static readonly stepWidth = 14;
  private static readonly deepestStep = 4;

  private map: any;
  private listNode: HTMLElement | null = null;
  private placeholderNode: HTMLElement | null = null;
  private authorsNode: HTMLElement | null = null;
  private repliesNode: HTMLInputElement | null = null;
  private appliedNode: HTMLElement | null = null;

  // The words of a comment, kept by the data object they were
  // read out of. A stale entry becomes unreachable on its own.
  private textOfData: WeakMap<object, { html: string; text: string }> =
    new WeakMap();

  private sortKey: CommentSortKey = 'position';

  // Which way round the order runs. False is the way the thing
  // it is read from runs by itself, down the document or A to Z.
  private sortDescending: boolean = false;

  // The button that picks each order and the one that turns it
  // round, so the row can be marked without being built again.
  private sortChoiceNodes: Map<CommentSortKey, HTMLElement> = new Map();
  private sortDirectionNode: HTMLElement | null = null;

  // The button that adds each state filter, so the one that
  // holds can be marked from the filters themselves.
  private statusChoiceNodes: Map<CommentFilters['status'], HTMLElement> =
    new Map();

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

  // The comments whose box the rows held when they were last
  // built, by id, joined into one string.
  private commentsBeingWritten: string = '';

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

    // Whether a reader may write comments decides whether the
    // rows offer the menu, so a change of it reaches the rows.
    app.events.on('updatepermission', () => this.markStale());
  }

  private build(panel: HTMLElement): void {
    panel.replaceChildren(
      <div class="comments-panel">
        {this.buildSortRow()}
        {this.buildFilters()}
        <div
          class="comments-panel-applied"
          aria-label={_('Filters in force')}
          ref={(node: HTMLElement) => (this.appliedNode = node)}
        ></div>
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

  // The order the rows are in: what it is read from, and which
  // way round it runs. Both sit on a line of their own.
  private buildSortRow(): HTMLElement {
    const choices: Array<{ key: CommentSortKey; label: string }> = [
      { key: 'position', label: _('Position') },
      { key: 'date', label: _('Date') },
      { key: 'author', label: _('Author') },
    ];

    this.sortChoiceNodes.clear();

    return (
      <div class="comments-panel-sort" role="group" aria-label={_('Sort by')}>
        <span class="comments-panel-sort-label">{_('Sort')}</span>
        {choices.map((choice) => {
          const picked = this.sortKey === choice.key;
          const button = (
            <button
              class={
                'comments-panel-sort-choice' + (picked ? ' is-picked' : '')
              }
              type="button"
              aria-pressed={String(picked)}
              onClick={() => this.pickSortKey(choice.key)}
            >
              {choice.label}
            </button>
          ) as HTMLElement;
          this.sortChoiceNodes.set(choice.key, button);
          return button;
        })}
        {this.buildSortDirection()}
      </div>
    );
  }

  // Turns the order round. It carries what the order becomes
  // when it is pressed, which is what a reader wants to know.
  private buildSortDirection(): HTMLElement {
    const button = (
      <button
        class={
          'comments-panel-sort-direction' +
          (this.sortDescending ? ' is-turned' : '')
        }
        type="button"
        onClick={() => {
          this.sortDescending = !this.sortDescending;
          this.markTheSortRow();
          this.render();
        }}
      ></button>
    ) as HTMLElement;

    this.sortDirectionNode = button;
    this.sayWhatTurningTheOrderDoes();
    return button;
  }

  // What the order becomes if the direction is pressed, in the
  // words of the thing the order is read from.
  private sayWhatTurningTheOrderDoes(): void {
    if (!this.sortDirectionNode) return;

    let label = this.sortDescending
      ? _('From the top of the document')
      : _('From the bottom of the document');
    if (this.sortKey === 'date')
      label = this.sortDescending ? _('Oldest first') : _('Newest first');
    else if (this.sortKey === 'author')
      label = this.sortDescending ? _('A to Z') : _('Z to A');

    this.sortDirectionNode.setAttribute('aria-label', label);
    this.sortDirectionNode.dataset.title = label;
  }

  private pickSortKey(key: CommentSortKey): void {
    if (this.sortKey === key) return;

    this.sortKey = key;
    this.markTheSortRow();
    this.render();
  }

  private markTheSortRow(): void {
    this.sortChoiceNodes.forEach((button, held) => {
      const picked = held === this.sortKey;
      button.classList.toggle('is-picked', picked);
      button.setAttribute('aria-pressed', String(picked));
    });
    this.sortDirectionNode?.classList.toggle('is-turned', this.sortDescending);
    this.sayWhatTurningTheOrderDoes();
  }

  // The controls that add a filter, behind a fold that starts
  // closed. What they added is on show below it either way.
  private buildFilters(): HTMLElement {
    return (
      <details class="comments-panel-filters">
        <summary class="comments-panel-filters-summary">
          <span class="comments-panel-filters-label">{_('Filters')}</span>
          <span class="comments-panel-filters-arrow" aria-hidden="true"></span>
        </summary>
        <div class="comments-panel-filters-body">
          <fieldset class="comments-panel-filter-group">
            <legend>{_('Status')}</legend>
            {this.buildStatusChoice('unresolved', _('Unresolved'))}
            {this.buildStatusChoice('resolved', _('Resolved'))}
          </fieldset>
          <label class="comments-panel-filter-check">
            <input
              class="comments-panel-filter-replies"
              type="checkbox"
              ref={(node: HTMLElement) =>
                (this.repliesNode = node as HTMLInputElement)
              }
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
        </div>
      </details>
    );
  }

  // One of the two states a thread can be in. Picking the one
  // that holds lets it go again, leaving both states in.
  private buildStatusChoice(
    status: CommentFilters['status'],
    label: string,
  ): HTMLElement {
    const button = (
      <button
        class="comments-panel-filter-choice"
        type="button"
        data-status={status}
        onClick={() => {
          this.filters.status = this.filters.status === status ? 'all' : status;
          this.render();
        }}
      >
        {label}
      </button>
    ) as HTMLElement;

    this.statusChoiceNodes.set(status, button);
    return button;
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

  // The words to look for, which come from the search box at the
  // top of the panel while the comments tab is on show.
  public setSearch(search: string): void {
    if (this.filters.search === search) return;

    this.filters.search = search;
    this.render();
  }

  private clearFilters(): void {
    this.filters.search = '';
    this.filters.authors.clear();
    this.filters.status = 'all';
    this.filters.onlyWithReplies = false;
    this.clearTheSearchBox();

    this.render();
  }

  // The controls are drawn from the filters rather than from a
  // state of their own, so the strip and they are one thing.
  private drawTheControlsFromTheFilters(): void {
    this.statusChoiceNodes.forEach((button, status) => {
      const picked = this.filters.status === status;
      button.classList.toggle('is-picked', picked);
      button.setAttribute('aria-pressed', String(picked));
    });

    const replies = this.repliesNode;
    if (replies) replies.checked = this.filters.onlyWithReplies;

    this.authorsNode
      ?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      .forEach((box) => {
        box.checked = this.filters.authors.has(box.value);
      });
  }

  // The search box at the top of the panel is where the words to
  // look for are typed, so taking that filter away empties it.
  private clearTheSearchBox(): void {
    this.map.navigator?.clearSearchBox();
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

  // Threads in the order the sort controls ask for.
  private sortThreads(threads: CommentThread[]): CommentThread[] {
    if (this.sortKey === 'position' && !this.sortDescending) return threads;

    const inDocumentOrder = threads.map((thread, index) => ({
      thread: thread,
      index: index,
    }));

    inDocumentOrder.sort((left, right) => {
      const leftData = left.thread.root.sectionProperties.data;
      const rightData = right.thread.root.sectionProperties.data;

      let order = 0;
      if (this.sortKey === 'date')
        order =
          CommentsPanel.timeOf(leftData) - CommentsPanel.timeOf(rightData);
      else if (this.sortKey === 'author')
        order = String(leftData.author ?? '').localeCompare(
          String(rightData.author ?? ''),
        );

      // Threads the order cannot tell apart keep the order they
      // came in. Turning it round turns those over too.
      return (
        (order || left.index - right.index) * (this.sortDescending ? -1 : 1)
      );
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
    // A thread somebody is writing in is always in the list, or
    // a filter would leave the writer nowhere to write.
    if ([thread.root, ...thread.replies].some((comment) => comment.isEdit()))
      return true;

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

  // The rows hold the box a comment is written in, so a change
  // in which comments are being written has to reach them.
  public checkTheCommentsBeingWritten(): void {
    const section = this.getCommentSection();
    if (!section) return;

    const beingWritten = (section.sectionProperties.commentList as any[])
      .filter((comment) => comment.isEdit())
      .map((comment) => String(comment.sectionProperties.data.id))
      .join(',');

    if (beingWritten === this.commentsBeingWritten) return;
    this.commentsBeingWritten = beingWritten;
    this.markStale();
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

    // Building the rows moves the box a comment is written in,
    // which takes the focus off it, so the focus goes back.
    const written = this.theFocusInsideABoxBeingWrittenIn();

    const scrollTop = this.listNode.scrollTop;
    this.builtRows = [];
    this.returnTheEditorsToTheirComments();
    this.listNode.replaceChildren(
      ...shown.map((thread) => this.buildThreadRow(thread)),
    );
    this.listNode.scrollTop = scrollTop;

    // The row that holds a box to write in is brought into view,
    // because that is where the reader is about to type.
    this.listNode
      .querySelector<HTMLElement>('.comments-panel-comment.is-being-written')
      ?.scrollIntoView({ block: 'nearest' });

    if (written && written.isConnected) written.focus();
    app.layoutingService.appendLayoutingTask(() =>
      this.offerToOpenTheCutRows(),
    );

    const held = threads.filter(
      (thread) => thread.root.sectionProperties.data.id !== 'new',
    ).length;
    this.placeholderNode.textContent =
      held === 0
        ? _('This document has no comments.')
        : _('No comment matches the filters.');
    this.placeholderNode.classList.toggle('hidden', shown.length > 0);

    this.drawTheControlsFromTheFilters();
    this.showWhatIsNarrowingTheList();
  }

  // What is narrowing the list, one chip each, with a cross that
  // takes that one away. It is out of the way while none hold.
  private showWhatIsNarrowingTheList(): void {
    if (!this.appliedNode) return;

    const applied: Array<{ name: string; remove: () => void }> = [];

    const search = this.filters.search.trim();
    if (search.length > 0)
      applied.push({
        name: search,
        remove: () => {
          this.filters.search = '';
          this.clearTheSearchBox();
          this.render();
        },
      });

    if (this.filters.status !== 'all')
      applied.push({
        name:
          this.filters.status === 'resolved' ? _('Resolved') : _('Unresolved'),
        remove: () => {
          this.filters.status = 'all';
          this.render();
        },
      });

    if (this.filters.onlyWithReplies)
      applied.push({
        name: _('With replies'),
        remove: () => {
          this.filters.onlyWithReplies = false;
          this.render();
        },
      });

    for (const author of Array.from(this.filters.authors))
      applied.push({
        name: author,
        remove: () => {
          this.filters.authors.delete(author);
          this.render();
        },
      });

    const chips: HTMLElement[] = applied.map((filter) =>
      this.buildAppliedChip(filter),
    );

    // Taking them away one at a time is a chore once there are
    // several of them.
    if (applied.length > 1)
      chips.push(
        <button
          class="comments-panel-applied-clear"
          type="button"
          onClick={() => this.clearFilters()}
        >
          {_('Clear all')}
        </button>,
      );

    this.appliedNode.replaceChildren(...chips);
    this.appliedNode.classList.toggle('hidden', applied.length === 0);
  }

  private buildAppliedChip(filter: {
    name: string;
    remove: () => void;
  }): HTMLElement {
    const away = _('Stop narrowing the list by {name}').replace(
      '{name}',
      filter.name,
    );

    return (
      <span class="comments-panel-applied-chip">
        <span class="comments-panel-applied-name">{filter.name}</span>
        <button
          class="comments-panel-applied-remove"
          type="button"
          aria-label={away}
          data-title={away}
          onClick={filter.remove}
        ></button>
      </span>
    );
  }

  // Whatever holds the focus inside a box a comment is being
  // written in, or null when the focus is somewhere else.
  private theFocusInsideABoxBeingWrittenIn(): HTMLElement | null {
    const focused = document.activeElement as HTMLElement | null;
    if (!focused || !focused.closest('.cool-annotation-edit')) return null;
    return focused;
  }

  // The rows the pass is about to throw away hand their boxes
  // back to the comments they belong to first.
  private returnTheEditorsToTheirComments(): void {
    this.listNode
      ?.querySelectorAll<HTMLElement>('.cool-annotation-edit')
      .forEach((editor) => {
        editor.classList.remove('comment-editor-in-the-list');
        const comment = this.commentOfId(editor.dataset.editorOf ?? '');
        if (comment) comment.sectionProperties.wrapper.appendChild(editor);
        else editor.remove();
      });
  }

  private commentOfId(id: string): any {
    const section = this.getCommentSection();
    if (!section || id.length === 0) return null;
    return (section.sectionProperties.commentList as any[]).find(
      (comment) => String(comment.sectionProperties.data.id) === id,
    );
  }

  // The box a comment is being written in, moved out of the
  // comment's frame and into its row.
  private editorOf(comment: any): HTMLElement | null {
    const properties = comment.sectionProperties;
    let editor: HTMLElement | null = null;
    if (properties.nodeModify && properties.nodeModify.style.display !== 'none')
      editor = properties.nodeModify;
    else if (
      properties.nodeReply &&
      properties.nodeReply.style.display !== 'none'
    )
      editor = properties.nodeReply;
    if (!editor) return null;

    editor.dataset.editorOf = String(properties.data.id);
    editor.classList.add('comment-editor-in-the-list');
    return editor;
  }

  // The comments of the document, each with the replies under
  // it. A reply of a reply ends up under the same first one.
  private collectThreads(): CommentThread[] {
    const section = this.getCommentSection();
    if (!section) return [];

    // A comment with a tracked change is read beside the page.
    // One not written yet keeps a row, for the box it holds.
    const comments: any[] = (
      section.sectionProperties.commentList as any[]
    ).filter((comment) => !comment.sectionProperties.data.trackchange);

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

    // A comment being modified holds its words in the box below,
    // so the row does not show them twice over.
    const editor = this.editorOf(comment);
    const beingModified = editor !== null && comment.isModifying();

    // Beyond this depth the steps would leave no room to read
    // in, so the deeper replies line up with the last step.
    const step = Math.min(depth, CommentsPanel.deepestStep);

    return (
      <div
        class={
          'comments-panel-comment' +
          (comment === thread.root ? ' is-first' : ' is-reply') +
          (id === this.selectedId ? ' is-selected' : '') +
          (editor !== null ? ' is-being-written' : '')
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
          {!beingModified && textNode}
        </button>
        <div class="comments-panel-comment-footer">
          {this.buildCommentTags(thread, comment)}
          {openNode}
          {app.isCommentEditingAllowed() &&
            id !== 'new' &&
            this.buildMenuButton(comment)}
        </div>
        {editor}
      </div>
    );
  }

  // Opens the menu of actions for a comment. The menu is the
  // comment's own, so the list offers what the page offers.
  private buildMenuButton(comment: any): HTMLElement {
    return (
      <button
        class="comments-panel-comment-menu cool-annotation-menu"
        type="button"
        aria-label={_('Open menu')}
        data-title={_('Open menu')}
        onClick={(event: MouseEvent) =>
          comment.openContextMenu(event.currentTarget as HTMLElement)
        }
      ></button>
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
