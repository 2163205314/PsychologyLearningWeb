(function () {
    'use strict';

    marked.setOptions({
        breaks: false,
        gfm: true
    });

    /* ===== 全局搜索 ===== */
    var searchInput = document.getElementById('global-search');
    var searchResults = document.getElementById('search-results');
    var searchTimer = null;

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            clearTimeout(searchTimer);
            var query = this.value.trim();
            if (query.length < 2) {
                searchResults.classList.remove('active');
                searchResults.innerHTML = '';
                return;
            }
            searchTimer = setTimeout(function () {
                fetch('/api/search?q=' + encodeURIComponent(query))
                    .then(function (r) { return r.json(); })
                    .then(function (results) {
                        if (results.length === 0) {
                            searchResults.innerHTML = '<div class="search-result-item" style="color:#a0aec0;">未找到结果</div>';
                        } else {
                            searchResults.innerHTML = results.map(function (item) {
                                return '<a href="/section/' + item.id + '" class="search-result-item">' +
                                    '<div class="result-book">' + escapeHtml(item.book_title) + '</div>' +
                                    '<div class="result-title">' + escapeHtml(item.heading_text) + '</div>' +
                                    '</a>';
                            }).join('');
                        }
                        searchResults.classList.add('active');
                    });
            }, 300);
        });

        document.addEventListener('click', function (e) {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.classList.remove('active');
            }
        });
    }

    /* ===== 目录树折叠/展开 ===== */
    function initTocTree() {
        var toggles = document.querySelectorAll('.toc-toggle:not(.toc-leaf)');
        toggles.forEach(function (toggle) {
            toggle.addEventListener('click', function (e) {
                e.stopPropagation();
                var children = this.parentElement.nextElementSibling;
                if (children && children.classList.contains('toc-children')) {
                    var isHidden = children.style.display === 'none';
                    children.style.display = isHidden ? 'block' : 'none';
                    this.classList.toggle('expanded', isHidden);
                }
            });
        });
    }

    /* ===== 展开到当前激活节点 ===== */
    function expandToActive() {
        var active = document.querySelector('.toc-node.active');
        if (!active) return;
        var parent = active.closest('.toc-children');
        while (parent) {
            parent.style.display = 'block';
            var toggle = parent.previousElementSibling.querySelector('.toc-toggle');
            if (toggle) toggle.classList.add('expanded');
            parent = parent.parentElement.closest('.toc-children');
        }
    }

    /* ===== 通过API加载目录树（section页面用） ===== */
    function loadTocViaApi(bookId, sectionId) {
        var tocTree = document.getElementById('toc-tree');
        if (!tocTree || !bookId) return;

        fetch('/api/book/' + bookId + '/tree')
            .then(function (r) { return r.json(); })
            .then(function (tree) {
                tocTree.innerHTML = buildTocHtml(tree, sectionId);
                initTocTree();
                expandToActive();
            })
            .catch(function () {
                tocTree.innerHTML = '<div class="toc-loading">目录加载失败</div>';
            });
    }

    function buildTocHtml(nodes, activeSectionId) {
        if (!nodes || nodes.length === 0) return '';
        var html = '<ul>';
        nodes.forEach(function (node) {
            var hasChildren = node.children && node.children.length > 0;
            var isActive = node.id === activeSectionId;
            html += '<li class="toc-item">';
            html += '<div class="toc-node' + (isActive ? ' active' : '') + '" data-section-id="' + node.id + '">';
            if (hasChildren) {
                html += '<span class="toc-toggle">▸</span>';
            } else {
                html += '<span class="toc-toggle toc-leaf"></span>';
            }
            html += '<a href="/section/' + node.id + '" class="toc-link">' + escapeHtml(node.heading_text) + '</a>';
            html += '</div>';
            if (hasChildren) {
                html += '<div class="toc-children" style="display:none;">';
                html += buildTocHtml(node.children, activeSectionId);
                html += '</div>';
            }
            html += '</li>';
        });
        html += '</ul>';
        return html;
    }

    /* ===== 书本内搜索 ===== */
    var bookSearchInput = document.getElementById('book-search');
    if (bookSearchInput) {
        var bookId = bookSearchInput.getAttribute('data-book-id');
        bookSearchInput.addEventListener('input', function () {
            var query = this.value.trim().toLowerCase();
            var items = document.querySelectorAll('.toc-item');
            items.forEach(function (item) {
                var link = item.querySelector('.toc-link');
                if (!link) return;
                var text = link.textContent.toLowerCase();
                if (query.length < 1 || text.indexOf(query) !== -1) {
                    item.style.display = '';
                    if (query.length >= 1 && text.indexOf(query) !== -1) {
                        var parents = item.querySelectorAll('.toc-children');
                        parents.forEach(function (p) { p.style.display = 'block'; });
                    }
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    /* ===== Markdown渲染 + KaTeX ===== */
    function renderMarkdown() {
        var body = document.getElementById('section-body');
        if (!body) return;

        var raw = body.textContent || body.innerText || '';

        var html = marked.parse(raw);

        body.innerHTML = html;

        if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(body, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\[', right: '\\]', display: true },
                    { left: '\\(', right: '\\)', display: false }
                ],
                throwOnError: false
            });
        }
    }

    /* ===== HTML转义 ===== */
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }

    /* ===== 初始化 ===== */
    function init() {
        initTocTree();
        expandToActive();
        renderMarkdown();

        var sectionData = window.SECTION_DATA;
        if (sectionData && sectionData.bookId) {
            loadTocViaApi(sectionData.bookId, sectionData.id);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
