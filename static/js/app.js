(function () {
    'use strict';

    marked.setOptions({
        breaks: false,
        gfm: true
    });

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
    var bookSearchResults = document.getElementById('book-search-results');
    var bookSearchTimer = null;

    if (bookSearchInput && bookSearchResults) {
        var bookId = bookSearchInput.getAttribute('data-book-id');
        
        function updateDropdownPosition() {
            var rect = bookSearchInput.getBoundingClientRect();
            bookSearchResults.style.top = (rect.bottom + 4) + 'px';
            bookSearchResults.style.left = rect.left + 'px';
        }

        bookSearchInput.addEventListener('focus', updateDropdownPosition);
        window.addEventListener('resize', updateDropdownPosition);
        document.querySelector('.sidebar').addEventListener('scroll', updateDropdownPosition);

        bookSearchInput.addEventListener('input', function () {
            clearTimeout(bookSearchTimer);
            var query = this.value.trim();
            if (query.length === 0) {
                bookSearchResults.classList.remove('active');
                bookSearchResults.innerHTML = '';
                return;
            }
            bookSearchTimer = setTimeout(function () {
                var url = '/api/search?q=' + encodeURIComponent(query);
                if (bookId) {
                    url += '&book_id=' + encodeURIComponent(bookId);
                }
                fetch(url)
                    .then(function (r) { return r.json(); })
                    .then(function (results) {
                        if (results.length === 0) {
                            bookSearchResults.classList.remove('active');
                            bookSearchResults.innerHTML = '';
                        } else {
                            bookSearchResults.innerHTML = results.map(function (item) {
                                return '<a href="/section/' + item.id + '?highlight=' + encodeURIComponent(query) + '" class="search-result-item">' +
                                    '<div class="result-title">' + escapeHtml(item.heading_text) + '</div>' +
                                    '<div class="result-snippet">' + escapeHtml(item.snippet) + '</div>' +
                                    '</a>';
                            }).join('');
                            bookSearchResults.classList.add('active');
                        }
                    });
            }, 300);
        });

        document.addEventListener('click', function (e) {
            if (!bookSearchInput.contains(e.target) && !bookSearchResults.contains(e.target)) {
                bookSearchResults.classList.remove('active');
            }
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

    /* ===== 搜索高亮 ===== */
    function highlightSearchTerm() {
        var params = new URLSearchParams(window.location.search);
        var query = params.get('highlight');
        if (!query) return;
        
        var body = document.getElementById('section-body');
        if (!body) return;

        var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
        var nodesToHighlight = [];
        var node;
        while (node = walker.nextNode()) {
            // Skip text inside scripts or math formulas
            var parent = node.parentNode;
            if (parent && (parent.tagName === 'SCRIPT' || parent.closest('.katex') || parent.closest('.math'))) {
                continue;
            }
            if (node.nodeValue.includes(query)) {
                nodesToHighlight.push(node);
            }
        }

        nodesToHighlight.forEach(function (n) {
            var parts = n.nodeValue.split(query);
            var frag = document.createDocumentFragment();
            for (var i = 0; i < parts.length; i++) {
                frag.appendChild(document.createTextNode(parts[i]));
                if (i < parts.length - 1) {
                    var mark = document.createElement('mark');
                    mark.className = 'search-highlight';
                    mark.textContent = query;
                    frag.appendChild(mark);
                }
            }
            n.parentNode.replaceChild(frag, n);
        });
    }

    /* ===== HTML转义 ===== */
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(text));
        return div.innerHTML;
    }

    /* ===== 首页导航栏收起/展开 ===== */
    function initNavSidebar() {
        var sidebar = document.getElementById('sidebar-nav');
        var collapseBtn = document.getElementById('nav-collapse-btn');
        var contentArea = document.querySelector('.content-area');
        if (!sidebar || !collapseBtn) return;

        var isCollapsed = localStorage.getItem('nav-sidebar-collapsed') === 'true';

        function applyCollapsed(collapsed) {
            if (window.innerWidth < 768) return;
            if (collapsed) {
                sidebar.classList.add('collapsed');
                if (contentArea) contentArea.style.marginLeft = '60px';
            } else {
                sidebar.classList.remove('collapsed');
                if (contentArea) contentArea.style.marginLeft = '';
            }
        }

        applyCollapsed(isCollapsed);

        collapseBtn.addEventListener('click', function () {
            isCollapsed = !isCollapsed;
            localStorage.setItem('nav-sidebar-collapsed', isCollapsed);
            applyCollapsed(isCollapsed);
        });

        window.addEventListener('resize', function () {
            applyCollapsed(isCollapsed);
        });
    }

    /* ===== 移动端侧边栏切换 ===== */
    function initMobileSidebar() {
        var hamburger = document.getElementById('hamburger-btn');
        var overlay = document.getElementById('sidebar-overlay');
        var sidebar = document.querySelector('.sidebar');
        if (!hamburger || !overlay) return;

        function openSidebar() {
            if (!sidebar) return;
            sidebar.classList.add('sidebar-open');
            overlay.classList.add('active');
            hamburger.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeSidebar() {
            if (!sidebar) return;
            sidebar.classList.remove('sidebar-open');
            overlay.classList.remove('active');
            hamburger.classList.remove('active');
            document.body.style.overflow = '';
        }

        hamburger.addEventListener('click', function () {
            if (sidebar && sidebar.classList.contains('sidebar-open')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        });

        overlay.addEventListener('click', closeSidebar);

        if (sidebar) {
            sidebar.addEventListener('click', function (e) {
                if (e.target.tagName === 'A') {
                    closeSidebar();
                }
            });
        }

        window.addEventListener('resize', function () {
            if (window.innerWidth >= 768) {
                closeSidebar();
            }
        });
    }

    /* ===== 初始化 ===== */
    function init() {
        initNavSidebar();
        initMobileSidebar();
        initTocTree();
        expandToActive();
        renderMarkdown();
        highlightSearchTerm();

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
