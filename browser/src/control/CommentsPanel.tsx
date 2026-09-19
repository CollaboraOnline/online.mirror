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

  private map: any;
  private listNode: HTMLElement | null = null;
  private placeholderNode: HTMLElement | null = null;
  private toolbarNode: HTMLElement | null = null;
  private filterButtonNode: HTMLElement | null = null;
  private filterBadgeNode: HTMLElement | null = null;
  private filterPopoverNode: HTMLElement | null = null;
  private sortPopoverNode: HTMLElement | null = null;
  private sortKeyNode: HTMLElement | null = null;
  private sortDirectionNode: HTMLElement | null = null;
  private sortArrowNode: HTMLElement | null = null;
  private liveNode: HTMLElement | null = null;

  // Which of the two menus is open, and none while both are shut.
  private openPopover: 'filter' | 'sort' | null = null;

  // Whether the press that a click is coming from is the one
  // that shut a menu.
  private thePressShutAMenu = false;

  // The threads the last pass collected, which the counts in the
  // bar are worked out over.
  private threads: CommentThread[] = [];
  private countUnresolved = 0;
  private countResolved = 0;

  // Whether the pass about to run is answering something the
  // reader did. Only such a pass may move the numbers.
  private theReaderAskedForThisPass = false;

  // The words of a comment, kept by the data object they were
  // read out of. A stale entry becomes unreachable on its own.
  private textOfData: WeakMap<object, { html: string; text: string }> =
    new WeakMap();

  private sortKey: CommentSortKey = 'position';

  // Which way round the order runs. False is the way the thing
  // it is read from runs by itself, down the document or A to Z.
  private sortDescending: boolean = false;

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

  // The threads whose replies are on show, by the id of the
  // comment each thread starts with.
  private openedThreads: Set<string> = new Set<string>();

  // Where the pointer was last seen, so a box that moves can be
  // told from a reader who walked away from it.
  private static wherethePointerIs: { x: number; y: number } | null = null;

  // A thread the reader has just settled or opened again, kept
  // in the list until the pointer leaves it, and the state the
  // list is still showing it in.
  private heldThread: string | null = null;
  private heldAsResolved = false;

  // The colours an author's letters sit on. Every one of them
  // carries white letters at the contrast the guidelines ask.
  private static readonly avatarColours = [
    '#1F6F8B', '#7A4E9E', '#A8432B', '#2E7D4F',
    '#8A5A00', '#38618C', '#9B2F5F', '#4A5D23',
  ];

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
    if (panel) {
      this.build(panel);
      this.steerTheToolbar();
    }

    // A comment added, removed or edited, and the full set that
    // arrives after a load or an undo.
    this.map.on('importannotations', this.markStale, this);
    this.map.on('insertannotation', this.markStale, this);
    this.map.on('deleteannotation', this.markStale, this);
    this.map.on('comment', this.markStale, this);

    // Whether a reader may write comments decides whether the
    // rows offer the menu, so a change of it reaches the rows.
    app.events.on('updatepermission', () => this.markStale());

    // A menu is shut by the key that shuts a menu, and by
    // acting anywhere that is not inside it.
    document.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !this.openPopover) return;
      const button =
        this.openPopover === 'filter' ? this.filterButtonNode : this.sortKeyNode;
      this.closePopovers();
      button?.focus();
    });

    document.addEventListener('pointermove', (event: PointerEvent) => {
      CommentsPanel.wherethePointerIs = { x: event.clientX, y: event.clientY };
    });

    document.addEventListener('pointerdown', (event: PointerEvent) => {
      // Only the click this press turns into is in question.
      this.thePressShutAMenu = false;
      if (!this.openPopover) return;
      const at = event.target as HTMLElement;
      if (at.closest('.comments-panel-popover')) return;
      if (at.closest('.comments-panel-filter-button')) return;
      if (at.closest('.comments-panel-sort-key')) return;
      this.closePopovers();
      this.thePressShutAMenu = true;
    });

    // Shutting a menu is the whole of what that press does, so
    // the click it turns into reaches nothing under it.
    document.addEventListener(
      'click',
      (event: MouseEvent) => {
        if (!this.thePressShutAMenu) return;
        this.thePressShutAMenu = false;
        event.stopPropagation();
        event.preventDefault();
      },
      true,
    );
  }

  private build(panel: HTMLElement): void {
    panel.replaceChildren(
      <div class="comments-panel">
        {this.buildToolbar()}
        {this.buildFilterPopover()}
        {this.buildSortPopover()}
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
        <p
          class="comments-panel-live"
          role="status"
          aria-live="polite"
          ref={(node: HTMLElement) => (this.liveNode = node)}
        ></p>
      </div>,
    );
  }

  // One bar over the list: how much of it there is, what is
  // holding it back, and the order it runs in.
  private buildToolbar(): HTMLElement {
    return (
      <div
        class="comments-panel-toolbar"
        role="toolbar"
        aria-label={_('Comment list controls')}
        ref={(node: HTMLElement) => (this.toolbarNode = node)}
      >
        <div class="comments-panel-status" role="group" aria-label={_('Status')}>
          {this.buildStatusChoice('unresolved', 'is-open')}
          {this.buildStatusChoice('resolved', 'is-done')}
        </div>
        <button
          class="comments-panel-filter-button"
          type="button"
          aria-haspopup="true"
          aria-expanded="false"
          aria-controls="comments-panel-filter-popover"
          tabindex="-1"
          onClick={() => this.togglePopover('filter')}
          ref={(node: HTMLElement) => (this.filterButtonNode = node)}
        >
          <span class="comments-panel-icon is-filter"></span>
          <span
            class="comments-panel-filter-badge"
            hidden
            ref={(node: HTMLElement) => (this.filterBadgeNode = node)}
          ></span>
        </button>
        <div class="comments-panel-sort">
          <button
            class="comments-panel-sort-key"
            type="button"
            aria-haspopup="true"
            aria-expanded="false"
            aria-controls="comments-panel-sort-popover"
            tabindex="-1"
            onClick={() => this.togglePopover('sort')}
            ref={(node: HTMLElement) => (this.sortKeyNode = node)}
          ></button>
          <button
            class="comments-panel-sort-direction"
            type="button"
            tabindex="-1"
            onClick={() => this.turnTheOrderRound()}
            ref={(node: HTMLElement) => (this.sortDirectionNode = node)}
          >
            <span
              class="comments-panel-icon"
              ref={(node: HTMLElement) => (this.sortArrowNode = node)}
            ></span>
          </button>
        </div>
      </div>
    );
  }

  // One state of a thread, as the count of the threads in it.
  private buildStatusChoice(
    status: 'unresolved' | 'resolved',
    icon: string,
  ): HTMLElement {
    const button = (
      <button
        class={
          'comments-panel-status-choice' +
          (status === 'resolved' ? ' is-done-choice' : '')
        }
        type="button"
        aria-pressed="false"
        tabindex="-1"
        onClick={() => this.pickStatus(status)}
      >
        <span class={'comments-panel-icon ' + icon}></span>
        <span class="comments-panel-status-count"></span>
      </button>
    ) as HTMLElement;

    this.statusChoiceNodes.set(status, button);
    return button;
  }

  // The next pass is answering something the reader did, so the
  // numbers on the bar may move for it.
  private theReaderAsked(): void {
    this.theReaderAskedForThisPass = true;
  }

  private pickStatus(status: 'unresolved' | 'resolved'): void {
    this.filters.status = this.filters.status === status ? 'all' : status;
    this.theReaderAsked();
    this.render();
  }

  private turnTheOrderRound(): void {
    this.sortDescending = !this.sortDescending;
    this.theReaderAsked();
    this.render();
  }

  private pickSortKey(key: CommentSortKey): void {
    this.sortKey = key;
    this.closePopovers();
    this.render();
  }

  // The authors and the reply filter, over the list rather than
  // above it, so the list keeps the height it had.
  private buildFilterPopover(): HTMLElement {
    return (
      <div
        class="comments-panel-popover"
        id="comments-panel-filter-popover"
        role="menu"
        aria-label={_('Filter')}
        hidden
        ref={(node: HTMLElement) => (this.filterPopoverNode = node)}
      ></div>
    );
  }

  private buildSortPopover(): HTMLElement {
    return (
      <div
        class="comments-panel-popover"
        id="comments-panel-sort-popover"
        role="menu"
        aria-label={_('Sort by')}
        hidden
        ref={(node: HTMLElement) => (this.sortPopoverNode = node)}
      ></div>
    );
  }

  private togglePopover(which: 'filter' | 'sort'): void {
    const open = this.openPopover === which ? null : which;
    this.closePopovers();
    this.openPopover = open;
    if (!open) return;

    if (open === 'filter') this.fillTheFilterPopover();
    else this.fillTheSortPopover();

    const popover =
      open === 'filter' ? this.filterPopoverNode : this.sortPopoverNode;
    const button =
      open === 'filter' ? this.filterButtonNode : this.sortKeyNode;
    if (popover) {
      popover.hidden = false;
      this.placeThePopover(popover, button);
    }
    if (button) button.setAttribute('aria-expanded', 'true');

    popover?.querySelector<HTMLElement>('.comments-panel-popover-row')?.focus();
  }

  // The bar is one stop on the way to the list, and the arrows
  // move between the controls once the focus is on it.
  private steerTheToolbar(): void {
    const bar = this.toolbarNode;
    if (!bar) return;

    bar.addEventListener('keydown', (event: KeyboardEvent) => {
      const stops = this.toolbarStops();
      const at = stops.indexOf(document.activeElement as HTMLElement);
      if (at < 0) return;

      let to = at;
      if (event.key === 'ArrowRight') to = (at + 1) % stops.length;
      else if (event.key === 'ArrowLeft')
        to = (at - 1 + stops.length) % stops.length;
      else if (event.key === 'Home') to = 0;
      else if (event.key === 'End') to = stops.length - 1;
      else return;

      event.preventDefault();
      this.restTheToolbarOn(stops[to]);
      stops[to].focus();
    });

    bar.addEventListener('focusin', (event: FocusEvent) => {
      const stop = event.target as HTMLElement;
      if (this.toolbarStops().includes(stop)) this.restTheToolbarOn(stop);
    });
  }

  // The controls the arrows reach. A state no thread is in is
  // not one of them.
  private toolbarStops(): HTMLElement[] {
    const bar = this.toolbarNode;
    if (!bar) return [];

    return Array.from(
      bar.querySelectorAll<HTMLElement>(
        '.comments-panel-status-choice, .comments-panel-filter-button,' +
          ' .comments-panel-sort-key, .comments-panel-sort-direction',
      ),
    ).filter((stop) => stop.getAttribute('aria-disabled') !== 'true');
  }

  private restTheToolbarOn(stop: HTMLElement): void {
    for (const other of this.toolbarStops())
      other.tabIndex = other === stop ? 0 : -1;
  }

  // The bar keeps one stop on it after a pass, so the order of
  // the controls does not decide where the focus lands.
  private keepTheToolbarReachable(): void {
    const stops = this.toolbarStops();
    if (stops.length === 0) return;
    if (stops.some((stop) => stop.tabIndex === 0)) return;
    this.restTheToolbarOn(stops[0]);
  }

  // A menu hangs under the control that opened it and keeps to
  // the window, which it may cross the panel's edge to do.
  private placeThePopover(
    popover: HTMLElement,
    button: HTMLElement | null,
  ): void {
    if (!button) return;

    const from = button.getBoundingClientRect();
    const room = 8;
    const width = popover.offsetWidth;
    const rightToLeft = document.documentElement.dir === 'rtl';

    // The menu hangs from the near edge of its button, the way
    // a menu hangs from the word that opens it.
    let left = rightToLeft ? from.right - width : from.left;
    left = Math.max(room, Math.min(left, window.innerWidth - width - room));

    popover.style.left = Math.round(left) + 'px';
    popover.style.top = Math.round(from.bottom + 4) + 'px';
  }

  private closePopovers(): void {
    this.openPopover = null;
    if (this.filterPopoverNode) this.filterPopoverNode.hidden = true;
    if (this.sortPopoverNode) this.sortPopoverNode.hidden = true;
    this.filterButtonNode?.setAttribute('aria-expanded', 'false');
    this.sortKeyNode?.setAttribute('aria-expanded', 'false');
  }

  // One row of a popover: who or what it stands for, how many
  // threads it holds, and whether it is on.
  private buildPopoverRow(row: {
    label: string;
    count: number | null;
    on: boolean;
    role: string;
    slot: HTMLElement;
    describe: string;
    act: () => void;
  }): HTMLElement {
    return (
      <button
        class={'comments-panel-popover-row' + (row.on ? ' is-on' : '')}
        type="button"
        role={row.role}
        aria-checked={String(row.on)}
        aria-label={row.describe}
        onClick={() => row.act()}
      >
        {row.slot}
        <span class="comments-panel-popover-name">{row.label}</span>
        {row.count !== null && (
          <span class="comments-panel-popover-count">{String(row.count)}</span>
        )}
        <span
          class={'comments-panel-popover-tick' + (row.on ? '' : ' is-off')}
        ></span>
      </button>
    );
  }

  private fillTheFilterPopover(): void {
    const node = this.filterPopoverNode;
    if (!node) return;

    const rows: HTMLElement[] = [
      (
        <div class="comments-panel-popover-label">{_('Author')}</div>
      ) as HTMLElement,
    ];

    for (const author of this.offeredAuthors) {
      const on = this.filters.authors.has(author);
      const count = this.countWithAuthor(author);
      rows.push(
        this.buildPopoverRow({
          label: author,
          count: count,
          on: on,
          role: 'menuitemcheckbox',
          describe: _('{author}, {count} threads')
            .replace('{author}', author)
            .replace('{count}', String(count)),
          slot: (
            <span
              class="comments-panel-popover-avatar"
              style={{ backgroundColor: this.avatarColour(author) }}
            >
              {CommentsPanel.initialsOf(author)}
            </span>
          ) as HTMLElement,
          act: () => {
            if (on) this.filters.authors.delete(author);
            else this.filters.authors.add(author);
            this.theReaderAsked();
            this.render();
            this.fillTheFilterPopover();
          },
        }),
      );
    }

    rows.push(
      (<div class="comments-panel-popover-separator"></div>) as HTMLElement,
    );
    rows.push(
      this.buildPopoverRow({
        label: _('Only threads with replies'),
        count: this.countWithReplies(),
        on: this.filters.onlyWithReplies,
        role: 'menuitemcheckbox',
        describe: _('Only threads with replies'),
        slot: (
          <span class="comments-panel-popover-slot">
            <span class="comments-panel-icon is-replies"></span>
          </span>
        ) as HTMLElement,
        act: () => {
          this.filters.onlyWithReplies = !this.filters.onlyWithReplies;
          this.theReaderAsked();
          this.render();
          this.fillTheFilterPopover();
        },
      }),
    );

    if (this.howManyFiltersHold() > 0) {
      rows.push(
        (<div class="comments-panel-popover-separator"></div>) as HTMLElement,
      );
      rows.push(
        this.buildPopoverRow({
          label: _('Reset the filters'),
          count: null,
          on: false,
          role: 'menuitem',
          describe: _('Reset the filters'),
          slot: (
            <span class="comments-panel-popover-slot">
              <span class="comments-panel-icon is-reset"></span>
            </span>
          ) as HTMLElement,
          act: () => {
            this.clearFilters();
            this.closePopovers();
          },
        }),
      );
    }

    node.replaceChildren(...rows);
  }

  private fillTheSortPopover(): void {
    const node = this.sortPopoverNode;
    if (!node) return;

    const keys: Array<{ key: CommentSortKey; label: string }> = [
      { key: 'position', label: _('Position') },
      { key: 'date', label: _('Date') },
      { key: 'author', label: _('Author') },
    ];

    const rows: HTMLElement[] = [
      (
        <div class="comments-panel-popover-label">{_('Sort by')}</div>
      ) as HTMLElement,
    ];

    for (const choice of keys)
      rows.push(
        this.buildPopoverRow({
          label: choice.label,
          count: null,
          on: this.sortKey === choice.key,
          role: 'menuitemradio',
          describe: choice.label,
          slot: (<span class="comments-panel-popover-slot"></span>) as HTMLElement,
          act: () => this.pickSortKey(choice.key),
        }),
      );

    rows.push(
      (<div class="comments-panel-popover-separator"></div>) as HTMLElement,
    );

    const ways = this.waysTheOrderRuns();
    for (const way of ways)
      rows.push(
        this.buildPopoverRow({
          label: way.label,
          count: null,
          on: this.sortDescending === way.descending,
          role: 'menuitemradio',
          describe: way.label,
          slot: (<span class="comments-panel-popover-slot"></span>) as HTMLElement,
          act: () => {
            this.sortDescending = way.descending;
            this.closePopovers();
            this.render();
          },
        }),
      );

    node.replaceChildren(...rows);
  }

  // What the two ways round the order runs are called, which
  // depends on what the order is read from.
  private waysTheOrderRuns(): Array<{ label: string; descending: boolean }> {
    if (this.sortKey === 'date')
      return [
        { label: _('Newest first'), descending: true },
        { label: _('Oldest first'), descending: false },
      ];
    if (this.sortKey === 'author')
      return [
        { label: _('A to Z'), descending: false },
        { label: _('Z to A'), descending: true },
      ];
    return [
      { label: _('Top of the document first'), descending: false },
      { label: _('End of the document first'), descending: true },
    ];
  }

  private sortKeyLabel(): string {
    if (this.sortKey === 'date') return _('Date');
    if (this.sortKey === 'author') return _('Author');
    return _('Position');
  }

  // How many filters hold that the bar cannot show on its own.
  // The status and the words looked for both show themselves.
  private howManyFiltersHold(): number {
    return this.filters.authors.size + (this.filters.onlyWithReplies ? 1 : 0);
  }

  // The words to look for, which come from the search box at the
  // top of the panel while the comments tab is on show.
  public setSearch(search: string): void {
    if (this.filters.search === search) return;

    this.filters.search = search;
    this.theReaderAsked();
    this.render();
  }

  private clearTheSearchBox(): void {
    this.map.navigator?.clearSearchBox();
  }

  private clearFilters(): void {
    this.filters.search = '';
    this.filters.authors.clear();
    this.filters.status = 'all';
    this.filters.onlyWithReplies = false;
    this.clearTheSearchBox();

    this.render();
  }

  // The counts and the states the bar shows, read from the
  // threads the other filters leave and from the filters.
  private drawTheControlsFromTheFilters(threads: CommentThread[]): void {
    // A pass the reader asked for may move the numbers. One that
    // only reports the document lands without motion.
    const mayMove = this.theReaderAskedForThisPass;
    this.theReaderAskedForThisPass = false;

    this.countUnresolved = 0;
    this.countResolved = 0;
    for (const thread of threads) {
      if (!this.matchesFilters(thread, 'status')) continue;
      if (this.theStatusTheListIsShowing(thread)) this.countResolved++;
      else this.countUnresolved++;
    }

    this.markStatusChoice('unresolved', this.countUnresolved, mayMove);
    this.markStatusChoice('resolved', this.countResolved, mayMove);

    const holding = this.howManyFiltersHold();
    const badge = this.filterBadgeNode;
    if (badge) {
      badge.textContent = String(holding);
      badge.hidden = holding === 0;
    }

    const filterButton = this.filterButtonNode;
    if (filterButton) {
      filterButton.classList.toggle('is-on', holding > 0);
      filterButton.setAttribute(
        'aria-label',
        holding > 0
          ? _('Filter, {count} in force').replace('{count}', String(holding))
          : _('Filter'),
      );
      filterButton.setAttribute('data-title', _('Filter'));
    }

    const key = this.sortKeyNode;
    if (key) {
      key.textContent = this.sortKeyLabel();
      key.setAttribute(
        'aria-label',
        _('Sort by: {key}').replace('{key}', this.sortKeyLabel()),
      );
    }

    const way = this.waysTheOrderRuns().find(
      (choice) => choice.descending === this.sortDescending,
    );
    const direction = this.sortDirectionNode;
    if (direction && way) {
      direction.setAttribute(
        'aria-label',
        _('Reverse the order. Now: {way}.').replace(
          '{way}',
          way.label.toLowerCase(),
        ),
      );
      direction.setAttribute('data-title', way.label);
    }

    const arrow = this.sortArrowNode;
    if (arrow) {
      arrow.classList.toggle('is-up', this.sortDescending);
      arrow.classList.toggle('is-down', !this.sortDescending);
    }
  }

  // The characters of a count, one cell each, so that only the
  // ones that change have to move.
  private setTheCount(
    node: HTMLElement,
    says: string,
    mayMove: boolean,
  ): void {
    const was = node.dataset.count ?? '';
    if (was === says) return;
    node.dataset.count = says;

    // Nothing to change from, a pass the reader did not ask for,
    // or a change on top of one still running: the count is
    // simply set. A change arriving faster than it can be shown
    // has stopped being worth showing.
    if (was === '' || !mayMove || node.querySelector('.is-folding') !== null) {
      CommentsPanel.setTheCountAtOnce(node, says);
      return;
    }

    // The cap shares its leading digits with the number below
    // it, so those line up at the start and the mark at the end
    // comes and goes. Plain numbers line up at the end.
    const capped = was.endsWith('+') || says.endsWith('+');
    const offset = capped ? 0 : says.length - was.length;

    const cells: HTMLElement[] = [];
    const starters: Array<() => void> = [];

    for (let i = Math.min(0, offset); i < says.length; i++) {
      const to = i < 0 ? null : says[i];
      const from = i - offset >= 0 ? (was[i - offset] ?? null) : null;

      if (to === null) cells.push(CommentsPanel.shrinkACell(from, starters));
      else if (from === null) cells.push(CommentsPanel.growACell(to, starters));
      else if (from === to) cells.push(CommentsPanel.restingCell(to));
      else cells.push(CommentsPanel.foldACell(from, to, starters));
    }

    node.replaceChildren(...cells);
    // Reading the layout fixes where every cell starts before
    // any of them moves.
    void node.offsetWidth;
    for (const start of starters) start();
  }

  private static restingCell(glyph: string): HTMLElement {
    return (
      <span class="comments-panel-status-digit">{glyph}</span>
    ) as HTMLElement;
  }

  // One glyph turning into another where it stands. The old one
  // folds away and the new one opens out of the fold.
  private static foldACell(
    from: string,
    to: string,
    starters: Array<() => void>,
  ): HTMLElement {
    const going = (<span class="is-going">{from}</span>) as HTMLElement;
    const coming = (<span class="is-coming">{to}</span>) as HTMLElement;
    const cell = (
      <span class="comments-panel-status-digit is-folding">
        {going}
        {coming}
      </span>
    ) as HTMLElement;

    starters.push(() => cell.classList.add('is-turned'));
    // The glyph arriving is the last thing to settle.
    CommentsPanel.settleTheCell(cell, coming, 'transform', to);
    return cell;
  }

  private static growACell(
    glyph: string,
    starters: Array<() => void>,
  ): HTMLElement {
    const cell = (
      <span class="comments-panel-status-digit is-growing">{glyph}</span>
    ) as HTMLElement;
    starters.push(() => cell.classList.add('is-open'));
    CommentsPanel.settleTheCell(cell, cell, 'width', glyph);
    return cell;
  }

  private static shrinkACell(
    glyph: string | null,
    starters: Array<() => void>,
  ): HTMLElement {
    const cell = (
      <span class="comments-panel-status-digit is-shrinking">{glyph ?? ''}</span>
    ) as HTMLElement;
    starters.push(() => cell.classList.add('is-closed'));
    CommentsPanel.settleTheCell(cell, cell, 'width', null);
    return cell;
  }

  private static setTheCountAtOnce(node: HTMLElement, says: string): void {
    node.replaceChildren(
      ...Array.from(says).map((glyph) => CommentsPanel.restingCell(glyph)),
    );
  }

  // Once a cell has finished moving it holds one glyph again,
  // so nothing is left clipping or transforming.
  private static settleTheCell(
    cell: HTMLElement,
    moving: HTMLElement,
    property: string,
    glyph: string | null,
  ): void {
    let done = false;
    const settle = () => {
      if (done || !cell.isConnected) return;
      done = true;
      if (glyph === null) cell.remove();
      else {
        cell.className = 'comments-panel-status-digit';
        cell.replaceChildren(glyph);
        cell.style.width = '';
      }
    };

    moving.addEventListener('transitionend', (event: TransitionEvent) => {
      if (event.target === moving && event.propertyName === property) settle();
    });
    // A cell the reader never sees moving still has to settle.
    setTimeout(settle, 600);
  }

  // How the list is showing a thread's state. One held in place
  // keeps the state it was let in with.
  private theStatusTheListIsShowing(thread: CommentThread): boolean {
    if (String(thread.root.sectionProperties.data.id) === this.heldThread)
      return this.heldAsResolved;
    return this.threadIsResolved(thread);
  }

  private markStatusChoice(
    status: 'unresolved' | 'resolved',
    count: number,
    mayMove: boolean,
  ): void {
    const button = this.statusChoiceNodes.get(status);
    if (!button) return;

    const on = this.filters.status === status;
    const shown = count > 99 ? '99+' : String(count);
    const countNode = button.querySelector<HTMLElement>(
      '.comments-panel-status-count',
    );
    if (countNode) this.setTheCount(countNode, shown, mayMove);

    button.classList.toggle('is-on', on);
    button.classList.toggle('is-empty', count === 0 && !on);
    button.setAttribute('aria-pressed', String(on));
    if (count === 0 && !on) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');

    const says =
      status === 'resolved'
        ? _('Resolved, {count} threads')
        : _('Unresolved, {count} threads');
    button.setAttribute('aria-label', says.replace('{count}', String(count)));
  }

  // How many threads one author wrote in, counted with the
  // author filter released so the number says what picking gives.
  private countWithAuthor(author: string): number {
    let count = 0;
    for (const thread of this.threads) {
      if (!this.matchesFilters(thread, 'authors')) continue;
      const comments = [thread.root, ...thread.replies];
      if (comments.some((c) => c.sectionProperties.data.author === author))
        count++;
    }
    return count;
  }

  private countWithReplies(): number {
    let count = 0;
    for (const thread of this.threads)
      if (thread.replies.length > 0 && this.matchesFilters(thread, 'replies'))
        count++;
    return count;
  }

  // The authors who wrote in the document, in the order a reader
  // would look for them.
  private updateAuthorFilter(threads: CommentThread[]): void {
    const seen = new Set<string>();
    for (const thread of threads)
      for (const comment of [thread.root, ...thread.replies])
        seen.add(String(comment.sectionProperties.data.author ?? ''));

    this.offeredAuthors = Array.from(seen)
      .filter((author) => author.length > 0)
      .sort((left, right) => left.localeCompare(right));

    for (const author of Array.from(this.filters.authors))
      if (!seen.has(author)) this.filters.authors.delete(author);
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

  private matchesFilters(
    thread: CommentThread,
    release: 'status' | 'authors' | 'replies' | null = null,
  ): boolean {
    // A thread somebody is writing in is always in the list, or
    // a filter would leave the writer nowhere to write.
    if ([thread.root, ...thread.replies].some((comment) => comment.isEdit()))
      return true;

    if (String(thread.root.sectionProperties.data.id) === this.heldThread)
      return true;

    if (release !== 'status') {
      const resolved = this.threadIsResolved(thread);
      if (this.filters.status === 'resolved' && !resolved) return false;
      if (this.filters.status === 'unresolved' && resolved) return false;
    }

    if (
      release !== 'replies' &&
      this.filters.onlyWithReplies &&
      thread.replies.length === 0
    )
      return false;

    const comments = [thread.root, ...thread.replies];
    if (
      release !== 'authors' &&
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
    this.threads = threads;
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

    this.drawTheControlsFromTheFilters(threads);
    this.sayWhatTheListHolds(shown.length, held);
    this.keepTheToolbarReachable();
  }

  // What the list holds after a pass, for a reader who cannot
  // see the counts on the bar.
  private sayWhatTheListHolds(shown: number, held: number): void {
    const node = this.liveNode;
    if (!node) return;

    const says = _('{shown} of {total} threads shown')
      .replace('{shown}', String(shown))
      .replace('{total}', String(held));
    if (node.textContent !== says) node.textContent = says;
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

  // A thread: the comment it starts with, the control that opens
  // the replies, and the replies once it has been asked for.
  private buildThreadRow(thread: CommentThread): HTMLElement {
    const rootId = String(thread.root.sectionProperties.data.id);
    const open = this.openedThreads.has(rootId);
    const held = rootId === this.heldThread;

    return (
      <li
        ref={(node: HTMLElement) => held && this.letGoOfTheHeldThread(node)}
        class={
          'comments-panel-thread' + (this.threadIsResolved(thread) ? ' is-resolved' : '')
        }
      >
        {this.buildCommentRow(thread, thread.root)}
        {thread.replies.length > 0 && this.buildRepliesToggle(thread, rootId, open)}
        {open && thread.replies.map((reply) => this.buildCommentRow(thread, reply))}
      </li>
    );
  }

  // The control that shows and hides the replies to a thread,
  // and says how many there are while they are hidden.
  private buildRepliesToggle(
    thread: CommentThread,
    rootId: string,
    open: boolean,
  ): HTMLElement {
    const count = thread.replies.length;
    const label = open
      ? _('Hide replies')
      : (count === 1 ? _('{count} reply') : _('{count} replies')).replace(
          '{count}',
          String(count),
        );

    return (
      <button
        class={'comments-panel-thread-replies' + (open ? ' is-open' : '')}
        type="button"
        aria-expanded={String(open)}
        onClick={() => this.toggleThread(rootId)}
      >
        {label}
      </button>
    );
  }

  // Settles a thread, or opens it again, from the card itself.
  private buildResolveButton(thread: CommentThread): HTMLElement | boolean {
    if (!app.isCommentEditingAllowed()) return false;
    if (!thread.root.canModerate || !thread.root.canModerate()) return false;

    const done = this.threadIsResolved(thread);
    const says = done ? _('Reopen the thread') : _('Resolve the thread');

    return (
      <button
        class={'comments-panel-thread-resolve' + (done ? ' is-done' : '')}
        type="button"
        aria-pressed={String(done)}
        aria-label={says}
        data-title={says}
        onClick={() => this.resolveThread(thread)}
      >
        <span class="comments-panel-icon is-done"></span>
      </button>
    );
  }

  private resolveThread(thread: CommentThread): void {
    // Settling a thread can take it out of what the filters
    // leave, and a card going out from under the pointer reads
    // as nothing having happened. It is held until the pointer
    // leaves it.
    this.heldThread = String(thread.root.sectionProperties.data.id);
    // The bar counts the thread the way the list is still
    // showing it, so the number waits for the card.
    this.heldAsResolved = this.threadIsResolved(thread);

    // The engine answers in its own time, so the card takes the
    // new state now and the answer confirms it.
    const settled = !this.threadIsResolved(thread);
    for (const comment of [thread.root, ...thread.replies])
      comment.sectionProperties.data.resolved = settled ? 'true' : 'false';

    this.getCommentSection()?.resolveThread(thread.root);

    // Rebuilding the list would throw this card away and put a
    // new one in its place, which is a jump under the pointer
    // and the end of the hold. Only what changed is drawn.
    this.drawTheSettledState(thread);
  }

  // What a thread being settled or opened again changes on the
  // card itself, without the list being built afresh.
  private drawTheSettledState(thread: CommentThread): void {
    const rootId = String(thread.root.sectionProperties.data.id);
    const card = this.rowOf(rootId)?.closest('.comments-panel-thread');
    if (!card) return;

    const done = this.threadIsResolved(thread);
    card.classList.toggle('is-resolved', done);

    const tick = card.querySelector<HTMLElement>(
      '.comments-panel-thread-resolve',
    );
    if (!tick) return;

    const says = done ? _('Reopen the thread') : _('Resolve the thread');
    tick.classList.toggle('is-done', done);
    tick.setAttribute('aria-pressed', String(done));
    tick.setAttribute('aria-label', says);
  }

  // Let go of the card the pointer has left, so the filters
  // hold again from the next pass.
  private letGoOfTheHeldThread(card: HTMLElement): void {
    const leaving = () => {
      // The card can move out from under a pointer that never
      // moved, which is the card leaving rather than the reader.
      if (CommentsPanel.thePointerIsOver(card)) {
        card.addEventListener('mouseleave', leaving, { once: true });
        return;
      }
      this.releaseTheHeldThread(card);
    };
    card.addEventListener('mouseleave', leaving, { once: true });

    card.addEventListener(
      'focusout',
      (event: FocusEvent) => {
        const to = event.relatedTarget as Node | null;
        if (to && card.contains(to)) return;
        // A pass of our own takes the focus to nowhere. A reader
        // leaving by keyboard always says where they went.
        if (to === null && CommentsPanel.thePointerIsOver(card)) return;
        this.releaseTheHeldThread(card);
      },
      { once: true },
    );
  }

  // Whether the pointer, wherever it was last seen, is inside a
  // box as that box stands now.
  private static thePointerIsOver(card: HTMLElement): boolean {
    const at = CommentsPanel.wherethePointerIs;
    if (!at) return false;

    const box = card.getBoundingClientRect();
    return (
      at.x >= box.left &&
      at.x <= box.right &&
      at.y >= box.top &&
      at.y <= box.bottom
    );
  }

  private releaseTheHeldThread(card: HTMLElement): void {
        if (this.heldThread === null) return;

        const held = this.heldThread;
        this.heldThread = null;
        // The bar says what the list holds, so the numbers start
        // moving as the card starts leaving.
        this.theReaderAsked();
        this.drawTheControlsFromTheFilters(this.threads);
        // A card the filters still keep stays where it is, so
        // only one on its way out is closed away.
        const thread = this.threads.find(
          (one) => String(one.root.sectionProperties.data.id) === held,
        );
        if (thread && this.matchesFilters(thread)) {
          this.render();
          return;
        }
        this.closeTheCardAway(card, () => this.render());
  }

  // Take a card out by closing the room it stands in, so the
  // cards under it come up rather than jump.
  private closeTheCardAway(card: HTMLElement, gone: () => void): void {
    // The card is laid out content box, so it is held at its
    // outer height with the box rule changed to match.
    card.style.boxSizing = 'border-box';
    card.style.height = card.getBoundingClientRect().height + 'px';
    // Reading the layout fixes the height before it closes.
    void card.offsetHeight;

    card.classList.add('is-leaving');
    card.style.height = '0px';

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      gone();
    };

    // The controls in the card fade on their own clock and their
    // end reaches the card too, so only the card's own counts.
    card.addEventListener('transitionend', (event: TransitionEvent) => {
      if (event.target === card && event.propertyName === 'height') finish();
    });
    // A card the reader never sees closing still has to go.
    setTimeout(finish, 600);
  }

  private toggleThread(rootId: string): void {
    if (this.openedThreads.has(rootId)) this.openedThreads.delete(rootId);
    else this.openedThreads.add(rootId);
    this.render();
  }

  // The name on the comment that this one answers. An answer
  // whose comment is gone falls back to an empty name.
  private parentAuthorOf(comment: any): string {
    const section = this.getCommentSection();
    if (!section) return '';
    const parent = section.getComment(
      String(comment.sectionProperties.data.parent),
    );
    return parent ? parent.sectionProperties.data.author : '';
  }

  // Whether every comment of a thread is resolved. The list
  // section holds the rule the page markers are drawn from.
  private threadIsResolved(thread: CommentThread): boolean {
    const section = this.getCommentSection();
    if (!section) return thread.root.sectionProperties.data.resolved === 'true';
    return section.isThreadResolved(thread.root) === true;
  }

  private buildCommentRow(thread: CommentThread, comment: any): HTMLElement {
    const data = comment.sectionProperties.data;
    const id = String(data.id);
    const opened = this.openedIds.has(id);
    const textId = 'comments-panel-text-' + id;

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
    const depth = thread.depthOfId.get(id) ?? 0;

    return (
      <div
        class={
          'comments-panel-comment' +
          (depth === 0 ? ' is-first' : ' is-reply') +
          (depth > 1 ? ' is-inner-reply' : '') +
          (id === this.selectedId ? ' is-selected' : '') +
          (editor !== null ? ' is-being-written' : '')
        }
        data-comment-id={id}
      >
        <div class="comments-panel-comment-head">
          {this.buildAvatar(data, comment === thread.root)}
          <span class="comments-panel-comment-author">{data.author}</span>
          <span
            class="comments-panel-comment-date"
            title={this.fullDate(data.dateTime)}
          >
            {this.shortDate(data.dateTime)}
          </span>
          {comment === thread.root && this.buildResolveButton(thread)}
          {app.isCommentEditingAllowed() &&
            id !== 'new' &&
            this.buildMenuButton(comment)}
        </div>
        <button
          class="comments-panel-comment-button"
          type="button"
          aria-label={
            depth > 1
              ? _('Go to the reply by {author} to {parent}')
                  .replace('{author}', data.author)
                  .replace('{parent}', this.parentAuthorOf(comment))
              : _('Go to the comment by {author}').replace(
                  '{author}',
                  data.author,
                )
          }
          onClick={() => this.goToComment(comment)}
        >
          {!beingModified && textNode}
        </button>
        <div class="comments-panel-comment-footer">{openNode}</div>
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

  private static openLabel(opened: boolean): string {
    return opened ? _('Show less') : _('Show more');
  }

  // Offer the open control on the rows whose comment does not
  // fit the three lines a row gives it.
  private offerToOpenTheCutRows(): void {
    const cutShort = this.builtRows.map(
      (row) => row.textNode.scrollHeight > row.textNode.clientHeight,
    );

    this.builtRows.forEach((row, i) => {
      row.openNode.classList.toggle(
        'hidden',
        !cutShort[i] && !this.openedIds.has(row.id),
      );
    });
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

  // The author, as the picture the host gave for them or as the
  // letters of their name on a colour that name always takes.
  private buildAvatar(data: any, isRoot: boolean): HTMLElement {
    const size = isRoot ? ' is-root' : ' is-reply';
    const hostAvatar = this.map['wopi']
      ? this.map['wopi'].CommentAvatarUrl
      : null;
    const picture = hostAvatar || data.avatar;

    if (picture) {
      const image = (
        <img class="avatar-img" alt="" src={picture} />
      ) as HTMLImageElement;
      return (
        <span class={'comments-panel-comment-avatar' + size} aria-hidden="true">
          {image}
        </span>
      );
    }

    return (
      <span
        class={'comments-panel-comment-avatar is-letters' + size}
        style={{ backgroundColor: this.avatarColour(data.author) }}
        aria-hidden="true"
      >
        {CommentsPanel.initialsOf(data.author)}
      </span>
    );
  }

  // At most two letters, from the first and last word of a name.
  private static initialsOf(author: string): string {
    const words = String(author || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    const first = words[0][0];
    const last = words.length > 1 ? words[words.length - 1][0] : '';
    return (first + last).toUpperCase();
  }

  // The colour an author's letters sit on: the colour of their
  // view while they are here, and one their name picks otherwise.
  private avatarColour(author: string): string {
    const own = this.authorColor(author);
    if (own) return own;

    let hash = 0;
    const name = String(author || '');
    for (let i = 0; i < name.length; i++)
      hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
    return CommentsPanel.avatarColours[hash % CommentsPanel.avatarColours.length];
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
    this.selectedId = id;
    this.takeOffTheFiltersHidingTheComment(id);
    if (this.stale || !this.rowOf(id)) this.render();
    this.markSelectedRow(id);

    // The panel takes a moment to come up, and a row not on the
    // page yet cannot be scrolled to, so the scrolling waits.
    app.layoutingService.appendLayoutingTask(() => {
      const row = this.rowOf(id);
      if (!row) return;

      this.carryTheListTo(row, () =>
        CommentsPanel.markTheArrival(row.closest('.comments-panel-thread')),
      );
    });
  }

  // Scroll the list so a row is on it, over a moment that grows
  // with the distance, and slowest as it arrives.
  private carryTheListTo(row: HTMLElement, arrived: () => void): void {
    const list = this.listNode;
    if (!list) return;

    const from = list.scrollTop;
    const to = CommentsPanel.whereTheListHasToBe(list, row);
    const distance = to - from;

    if (!CommentsPanel.motionIsWanted() || Math.abs(distance) < 2) {
      list.scrollTop = to;
      arrived();
      return;
    }

    // Long and short journeys both want to feel deliberate, so
    // the time grows with the distance between two bounds.
    const time = Math.min(520, Math.max(240, Math.abs(distance) * 0.6));
    const started = performance.now();

    const step = (now: number) => {
      const part = Math.min(1, (now - started) / time);
      // Fast at first and easing to nothing, so the list settles
      // rather than stopping.
      const eased = 1 - Math.pow(1 - part, 3);
      list.scrollTop = from + distance * eased;

      if (part < 1) requestAnimationFrame(step);
      else arrived();
    };
    requestAnimationFrame(step);
  }

  // Where the list has to stand for a row to be read. A row it
  // has to move for goes to the middle, not against an edge.
  private static whereTheListHasToBe(
    list: HTMLElement,
    row: HTMLElement,
  ): number {
    const room = 12;
    // Measured against the list rather than against whatever the
    // row is laid out in, which is the card around it.
    const listBox = list.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    const top = rowBox.top - listBox.top + list.scrollTop;
    const height = rowBox.height;

    // A list shorter than the room it is given has nowhere to go,
    // so the furthest it can stand is never below nothing.
    const furthest = Math.max(0, list.scrollHeight - list.clientHeight);
    const held = (where: number) => Math.min(furthest, Math.max(0, where));

    // A row already standing clear of both edges is left alone.
    const clear =
      top >= list.scrollTop + room &&
      top + height <= list.scrollTop + list.clientHeight - room;
    if (clear) return list.scrollTop;

    // One taller than the list can only have its start on show.
    if (height + room * 2 > list.clientHeight) return held(top - room);

    return held(top - (list.clientHeight - height) / 2);
  }

  // Whether the reader has asked for as little movement as the
  // machine can manage.
  private static motionIsWanted(): boolean {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // The card lights for a moment where the scrolling stopped, so
  // the eye is told which of them was being looked for.
  private static markTheArrival(card: Element | null): void {
    if (!card || !CommentsPanel.motionIsWanted()) return;

    card.classList.remove('has-arrived');
    // Reading the layout starts the animation again for a card
    // the reader has just come back to.
    void (card as HTMLElement).offsetWidth;
    card.classList.add('has-arrived');
    card.addEventListener(
      'animationend',
      () => card.classList.remove('has-arrived'),
      { once: true },
    );
  }

  // A marker stands on the page for every comment, so one the
  // filters hold back takes the filters off rather than walk
  // past them, and the bar says what the list now holds.
  private takeOffTheFiltersHidingTheComment(id: string): void {
    const thread = this.threads.find((held) =>
      [held.root, ...held.replies].some(
        (comment) => String(comment.sectionProperties.data.id) === id,
      ),
    );
    if (!thread || this.matchesFilters(thread)) return;

    // Each one is taken off only while the comment is still
    // held back, so the reader keeps the filters that are
    // letting it through.
    if (!this.matchesFilters(thread) && this.filters.status !== 'all')
      this.filters.status = 'all';
    if (!this.matchesFilters(thread) && this.filters.onlyWithReplies)
      this.filters.onlyWithReplies = false;
    if (!this.matchesFilters(thread) && this.filters.authors.size > 0)
      this.filters.authors.clear();
    if (!this.matchesFilters(thread) && this.filters.search !== '') {
      this.filters.search = '';
      this.clearTheSearchBox();
    }
    this.stale = true;
  }

  private rowOf(id: string): HTMLElement | null {
    return (
      this.listNode?.querySelector<HTMLElement>(
        '.comments-panel-comment[data-comment-id="' + id + '"]',
      ) ?? null
    );
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

  // dateTime is already in UTC, so no Z is appended: that would
  // go wrong when the date is converted.
  private static parseDate(dateTime: string): Date | null {
    if (!dateTime) return null;
    const date = new Date(dateTime.replace(/,.*/, ''));
    return isNaN(date.getTime()) ? null : date;
  }

  // How long ago a comment was written, short enough to sit on
  // one line beside the name of its author.
  private shortDate(dateTime: string): string {
    const date = CommentsPanel.parseDate(dateTime);
    if (!date) return dateTime || '';

    const locale = (String as any).locale;
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (minutes < 1) return _('now');
    if (minutes < 60) return _('{count}m').replace('{count}', String(minutes));

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return _('{count}h').replace('{count}', String(hours));
    if (hours < 24 * 7)
      return date.toLocaleDateString(locale, { weekday: 'short' });

    const thisYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString(
      locale,
      thisYear
        ? { day: 'numeric', month: 'short' }
        : { day: 'numeric', month: 'short', year: 'numeric' },
    );
  }

  // The whole moment, for the tooltip over the short form.
  private fullDate(dateTime: string): string {
    const date = CommentsPanel.parseDate(dateTime);
    if (!date) return dateTime || '';

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
