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
                var pageUnitLevel = getPageUnitLevel(tree);
                tocTree.innerHTML = buildTocHtml(tree, sectionId, null, pageUnitLevel);
                initTocTree();
                expandToActive();
            })
            .catch(function () {
                tocTree.innerHTML = '<div class="toc-loading">目录加载失败</div>';
            });
    }

    function getPageUnitLevel(nodes) {
        var sectionPattern = /^第[一二三四五六七八九十\d]+节/;
        var levelCounts = {};
        function walk(nodes) {
            nodes.forEach(function (node) {
                if (sectionPattern.test(node.heading_text)) {
                    levelCounts[node.heading_level] = (levelCounts[node.heading_level] || 0) + 1;
                }
                if (node.children && node.children.length > 0) {
                    walk(node.children);
                }
            });
        }
        walk(nodes);
        if (Object.keys(levelCounts).length === 0) {
            var max = 0;
            walk = function(nodes) {
                nodes.forEach(function (n) {
                    if (n.heading_level > max) max = n.heading_level;
                    if (n.children) walk(n.children);
                });
            };
            walk(nodes);
            return max > 1 ? max - 1 : max;
        }
        var bestLevel = 1;
        var bestCount = 0;
        for (var lvl in levelCounts) {
            if (levelCounts[lvl] > bestCount) {
                bestCount = levelCounts[lvl];
                bestLevel = parseInt(lvl);
            }
        }
        return bestLevel;
    }

    function buildTocHtml(nodes, activeSectionId, parentNode, pageUnitLevel) {
        if (!nodes || nodes.length === 0) return '';
        var html = '<ul>';
        nodes.forEach(function (node) {
            var hasChildren = node.children && node.children.length > 0;
            var isActive = node.id === activeSectionId;
            var linkTarget = '/section/' + node.id;
            var isPageUnit = node.heading_level === pageUnitLevel;
            var pageUnitAncestor = isPageUnit ? node : (parentNode || null);

            if (node.heading_level > pageUnitLevel && pageUnitAncestor) {
                linkTarget = '/section/' + pageUnitAncestor.id + '#section-' + node.id;
            }
            html += '<li class="toc-item">';
            html += '<div class="toc-node' + (isActive ? ' active' : '') + '" data-section-id="' + node.id + '">';
            if (hasChildren) {
                html += '<span class="toc-toggle">▸</span>';
            } else {
                html += '<span class="toc-toggle toc-leaf"></span>';
            }
            html += '<a href="' + linkTarget + '" class="toc-link">' + escapeHtml(node.heading_text) + '</a>';
            html += '</div>';
            if (hasChildren) {
                html += '<div class="toc-children" style="display:none;">';
                html += buildTocHtml(node.children, activeSectionId, pageUnitAncestor, pageUnitLevel);
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
                                var link = '/section/' + item.id;
                                return '<a href="' + link + '?highlight=' + encodeURIComponent(query) + '" class="search-result-item">' +
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

    /* ===== 选项卡切换 ===== */
    function initTabs() {
        var tabBtns = document.querySelectorAll('.tab-btn');
        if (tabBtns.length === 0) return;

        tabBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                if (isEditMode) return;

                tabBtns.forEach(function(b) { b.classList.remove('active'); });
                this.classList.add('active');

                var tab = this.getAttribute('data-tab');

                var tabKeypoints = document.getElementById('tab-keypoints');
                var tabExercises = document.getElementById('tab-exercises');
                var tabOriginal = document.getElementById('tab-original');
                var editBtn = document.getElementById('edit-btn');

                if (tabKeypoints) tabKeypoints.classList.remove('active');
                if (tabExercises) tabExercises.classList.remove('active');
                if (tabOriginal) tabOriginal.classList.remove('active');
                if (editBtn) editBtn.style.display = 'none';

                if (tab === 'keypoints') {
                    if (tabKeypoints) {
                        tabKeypoints.classList.add('active');
                        loadKeypoints();
                    }
                } else if (tab === 'exercises') {
                    if (tabExercises) {
                        tabExercises.classList.add('active');
                        loadExercises();
                    }
                } else if (tab === 'content') {
                    if (tabOriginal) tabOriginal.classList.add('active');
                    if (editBtn) editBtn.style.display = '';
                }
            });
        });
    }

    var keypointsLoaded = false;
    var exercisesLoaded = false;

    function loadKeypoints() {
        if (keypointsLoaded) return;
        var sectionData = window.SECTION_DATA;
        if (!sectionData || !sectionData.id) return;

        var container = document.getElementById('tab-keypoints');
        if (!container) return;

        container.innerHTML = '<div class="keypoints-loading">加载考点中...</div>';

        fetch('/api/section/' + sectionData.id + '/points')
            .then(function(r) { return r.json(); })
            .then(function(points) {
                if (points.length === 0) {
                    container.innerHTML = '<div class="keypoints-loading">暂无考点数据</div>';
                    return;
                }
                var html = '<div class="keypoints-list">';
                points.forEach(function(p, i) {
                    var stars = '';
                    for (var s = 0; s < (p.importance || 3); s++) {
                        stars += '\u2605';
                    }
                    html += '<div class="keypoint-item">';
                    html += '<div class="keypoint-header">';
                    html += '<span class="keypoint-num">' + (i + 1) + '</span>';
                    html += '<span class="keypoint-title">' + escapeHtml(p.point_text) + '</span>';
                    html += '<span class="keypoint-stars">' + stars + '</span>';
                    html += '</div>';
                    if (p.detail) {
                        html += '<div class="keypoint-detail">' + escapeHtml(p.detail) + '</div>';
                    }
                    html += '</div>';
                });
                html += '</div>';
                container.innerHTML = html;
                keypointsLoaded = true;
            })
            .catch(function() {
                container.innerHTML = '<div class="keypoints-loading">加载失败，请重试</div>';
            });
    }

    function loadExercises() {
        if (exercisesLoaded) return;
        var sectionData = window.SECTION_DATA;
        if (!sectionData || !sectionData.id) return;

        var container = document.getElementById('tab-exercises');
        if (!container) return;

        container.innerHTML = '<div class="exercises-loading">加载习题中...</div>';

        fetch('/api/section/' + sectionData.id + '/questions')
            .then(function(r) { return r.json(); })
            .then(function(questions) {
                if (questions.length === 0) {
                    container.innerHTML = '<div class="exercises-loading">暂无习题数据</div>';
                    return;
                }
                var html = '<div class="exercises-list">';
                questions.forEach(function(q, i) {
                    html += '<div class="question-block" data-qid="' + q.id + '">';
                    if (q.question_type === 'choice') {
                        html += renderChoiceQuestion(q, i + 1);
                    } else if (q.question_type === 'fill_blank') {
                        html += renderFillBlankQuestion(q, i + 1);
                    }
                    html += '</div>';
                });
                html += '</div>';
                container.innerHTML = html;
                exercisesLoaded = true;

                bindExerciseEvents();
            })
            .catch(function() {
                container.innerHTML = '<div class="exercises-loading">加载失败，请重试</div>';
            });
    }

    function renderChoiceQuestion(q, num) {
        var html = '';
        html += '<div class="question-stem"><span class="question-num">' + num + '.</span>' + escapeHtml(q.question_text) + '</div>';
        if (q.options) {
            try {
                var options = JSON.parse(q.options);
                html += '<div class="question-options">';
                var labels = ['A', 'B', 'C', 'D'];
                options.forEach(function(opt, oi) {
                    html += '<div class="option-item" data-answer="' + labels[oi] + '">';
                    html += '<span class="option-label">' + labels[oi] + '</span>';
                    html += '<span>' + escapeHtml(opt.substring(2).trim()) + '</span>';
                    html += '</div>';
                });
                html += '</div>';
            } catch(e) {}
        }
        html += '<div class="answer-reveal" id="answer-' + q.id + '">';
        html += '<strong>正确答案：' + escapeHtml(q.answer) + '</strong>';
        if (q.explanation) {
            html += '<br>' + escapeHtml(q.explanation);
        }
        html += '</div>';
        return html;
    }

    function renderFillBlankQuestion(q, num) {
        var html = '';
        var stem = q.question_text;
        stem = stem.replace(/______/g, '<input type="text" class="fill-blank-input" data-answer-id="' + q.id + '" placeholder="?">');
        html += '<div class="question-stem"><span class="question-num">' + num + '.</span>' + stem + '</div>';
        html += '<button class="check-answer-btn" data-answer-id="' + q.id + '">检查答案</button>';
        html += '<div class="answer-reveal" id="answer-' + q.id + '">';
        html += '<strong>正确答案：' + escapeHtml(q.answer) + '</strong>';
        if (q.explanation) {
            html += '<br>' + escapeHtml(q.explanation);
        }
        html += '</div>';
        return html;
    }

    function bindExerciseEvents() {
        var choiceItems = document.querySelectorAll('.option-item');
        choiceItems.forEach(function(item) {
            item.addEventListener('click', function() {
                var block = this.closest('.question-block');
                if (!block) return;
                var qid = block.getAttribute('data-qid');
                var allItems = block.querySelectorAll('.option-item');
                var selected = this.getAttribute('data-answer');
                var answerReveal = document.getElementById('answer-' + qid);

                var alreadyAnswered = false;
                allItems.forEach(function(it) {
                    if (it.classList.contains('correct') || it.classList.contains('wrong')) {
                        alreadyAnswered = true;
                    }
                });
                if (alreadyAnswered) return;

                allItems.forEach(function(it) { it.classList.remove('selected'); });
                this.classList.add('selected');

                if (answerReveal) answerReveal.classList.add('show');

                allItems.forEach(function(it) {
                    var answer = it.getAttribute('data-answer');
                    it.style.pointerEvents = 'none';
                    if (answer === selected) {
                        it.classList.add(answer === selected ? 'selected' : '');
                    }
                });

                var correctAnswer = selected;
                fetch('/api/section/' + window.SECTION_DATA.id + '/questions')
                    .then(function(r) { return r.json(); })
                    .then(function(questions) {
                        var q = questions.find(function(qq) { return qq.id == qid; });
                        if (q) correctAnswer = q.answer;
                        allItems.forEach(function(it) {
                            var answer = it.getAttribute('data-answer');
                            if (answer === correctAnswer) {
                                it.classList.add('correct');
                            } else if (answer === selected && selected !== correctAnswer) {
                                it.classList.add('wrong');
                            }
                        });
                    });
            });
        });

        var checkBtns = document.querySelectorAll('.check-answer-btn');
        checkBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var qid = btn.getAttribute('data-answer-id');
                var answerReveal = document.getElementById('answer-' + qid);
                var inputs = document.querySelectorAll('.fill-blank-input[data-answer-id="' + qid + '"]');
                var block = btn.closest('.question-block');

                fetch('/api/section/' + window.SECTION_DATA.id + '/questions')
                    .then(function(r) { return r.json(); })
                    .then(function(questions) {
                        var q = questions.find(function(qq) { return qq.id == qid; });
                        if (!q) return;

                        var correctAnswers = q.answer.split('；');
                        var allCorrect = true;

                        inputs.forEach(function(input, idx) {
                            var userAnswer = input.value.trim();
                            var expected = correctAnswers[idx] ? correctAnswers[idx].trim() : '';
                            if (userAnswer === expected) {
                                input.classList.add('correct');
                                input.classList.remove('wrong');
                            } else {
                                input.classList.add('wrong');
                                input.classList.remove('correct');
                                allCorrect = false;
                            }
                            input.disabled = true;
                        });

                        if (answerReveal) answerReveal.classList.add('show');
                        btn.disabled = true;
                    });
            });
        });
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /* ===== Markdown渲染 + KaTeX ===== */
    function renderMarkdown() {
        var body = document.getElementById('section-body');
        if (!body) return;

        var raw = body.innerHTML.trim();
        var html = marked.parse(raw);
        body.innerHTML = html;

        var imgs = body.querySelectorAll('img');
        imgs.forEach(function(img) {
            var src = img.getAttribute('src');
            if (src && src.indexOf('images/') === 0) {
                img.setAttribute('src', '/' + src);
            }
        });

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

    /* ===== 学习模块目录侧边栏收起/展开 ===== */
    function initTocSidebar() {
        var sidebar = document.getElementById('toc-sidebar');
        var collapseBtn = document.getElementById('toc-collapse-btn');
        var contentArea = document.querySelector('.content-area');
        if (!sidebar || !collapseBtn) return;

        var isCollapsed = localStorage.getItem('toc-sidebar-collapsed') === 'true';

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
            localStorage.setItem('toc-sidebar-collapsed', isCollapsed);
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

    /* ===== 记住上次浏览位置 ===== */
    function saveLastViewedSection() {
        var sectionData = window.SECTION_DATA;
        if (sectionData && sectionData.bookId && sectionData.id) {
            try {
                var key = 'last_section_' + sectionData.bookId;
                localStorage.setItem(key, sectionData.id);
            } catch (e) {}
        }
    }

    /* ===== 初始化 ===== */
    function init() {
        initNavSidebar();
        initTocSidebar();
        initMobileSidebar();
        initTocTree();
        expandToActive();
        renderMarkdown();
        initTabs();
        initEditMode();
        highlightSearchTerm();
        saveLastViewedSection();
        handleAnchorScroll();

        var sectionData = window.SECTION_DATA;
        if (sectionData && sectionData.bookId) {
            loadTocViaApi(sectionData.bookId, sectionData.id);
        }
    }

    /* ===== 编辑模式 ===== */
    var isEditMode = false;
    var originalHtml = '';
    var originalMarkdown = '';

    function htmlToMarkdown(node) {
        if (!node) return '';

        function processNode(n) {
            if (n.nodeType === Node.TEXT_NODE) {
                return n.textContent.replace(/\n/g, ' ').trim();
            }

            if (n.nodeType !== Node.ELEMENT_NODE) return '';

            var tag = n.tagName.toLowerCase();

            if (tag === 'h1') return '# ' + getText(n) + '\n\n';
            if (tag === 'h2') return '## ' + getText(n) + '\n\n';
            if (tag === 'h3') return '### ' + getText(n) + '\n\n';
            if (tag === 'h4') return '#### ' + getText(n) + '\n\n';
            if (tag === 'h5') return '##### ' + getText(n) + '\n\n';
            if (tag === 'h6') return '###### ' + getText(n) + '\n\n';
            if (tag === 'p') {
                var content = processChildren(n);
                return content.trim() ? content.trim() + '\n\n' : '';
            }
            if (tag === 'ul') {
                var result = '';
                n.querySelectorAll('li').forEach(function (li) {
                    result += '- ' + processChildren(li).trim() + '\n';
                });
                return result + '\n';
            }
            if (tag === 'ol') {
                var result = '';
                var idx = 1;
                n.querySelectorAll('li').forEach(function (li) {
                    result += idx + '. ' + processChildren(li).trim() + '\n';
                    idx++;
                });
                return result + '\n';
            }
            if (tag === 'li') return processChildren(n);
            if (tag === 'strong' || tag === 'b') return '**' + processChildren(n) + '**';
            if (tag === 'em' || tag === 'i') return '*' + processChildren(n) + '*';
            if (tag === 'code') return '`' + processChildren(n) + '`';
            if (tag === 'pre') return '\n```\n' + getText(n) + '\n```\n\n';
            if (tag === 'blockquote') return '> ' + processChildren(n).trim().replace(/\n/g, '\n> ') + '\n\n';
            if (tag === 'a') {
                var href = n.getAttribute('href') || '';
                var text = processChildren(n);
                return '[' + text + '](' + href + ')';
            }
            if (tag === 'img') {
                var src = n.getAttribute('src') || '';
                var alt = n.getAttribute('alt') || '';
                return '![' + alt + '](' + src + ')\n\n';
            }
            if (tag === 'br') return '\n';
            if (tag === 'hr') return '---\n\n';
            if (tag === 'div' || tag === 'span' || tag === 'a' || tag === 'code') {
                return processChildren(n);
            }

            return processChildren(n);
        }

        function processChildren(parent) {
            var result = '';
            parent.childNodes.forEach(function (child) {
                result += processNode(child);
            });
            return result;
        }

        function getText(el) {
            return el.textContent.trim();
        }

        return processNode(node).replace(/\n{3,}/g, '\n\n').trim();
    }

    function createHeadingToolbar(heading) {
        var toolbar = document.createElement('span');
        toolbar.className = 'heading-toolbar';
        toolbar.contentEditable = 'false';

        var level = parseInt(heading.tagName[1], 10);

        var upBtn = document.createElement('button');
        upBtn.innerHTML = '↑';
        upBtn.title = '升级标题';
        upBtn.disabled = level <= 1;
        upBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (level > 1) {
                changeHeadingLevel(heading, level - 1);
            }
        });

        var downBtn = document.createElement('button');
        downBtn.innerHTML = '↓';
        downBtn.title = '降级标题';
        downBtn.disabled = level >= 6;
        downBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (level < 6) {
                changeHeadingLevel(heading, level + 1);
            }
        });

        toolbar.appendChild(upBtn);
        toolbar.appendChild(downBtn);

        heading.insertBefore(toolbar, heading.firstChild);
    }

    function changeHeadingLevel(heading, newLevel) {
        var content = heading.innerHTML;
        var newHeading = document.createElement('h' + newLevel);
        newHeading.innerHTML = content;
        heading.parentNode.replaceChild(newHeading, heading);
    }

    function addHeadingToolbars() {
        var sectionBody = document.getElementById('section-body');
        var headings = sectionBody.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(function (heading) {
            if (!heading.querySelector('.heading-toolbar')) {
                createHeadingToolbar(heading);
            }
        });
    }

    function removeHeadingToolbars() {
        var sectionBody = document.getElementById('section-body');
        var toolbars = sectionBody.querySelectorAll('.heading-toolbar');
        toolbars.forEach(function (tb) { tb.remove(); });
    }

    function initEditMode() {
        var editBtn = document.getElementById('edit-btn');
        var saveBtn = document.getElementById('save-btn');
        var cancelBtn = document.getElementById('cancel-btn');
        var editActions = document.getElementById('edit-actions');
        var sectionBody = document.getElementById('section-body');

        if (!editBtn || !sectionBody) return;

        editBtn.addEventListener('click', function () {
            enterEditMode();
        });

        saveBtn.addEventListener('click', function () {
            saveEdit();
        });

        cancelBtn.addEventListener('click', function () {
            cancelEdit();
        });
    }

    function enterEditMode() {
        if (isEditMode) return;

        var sectionBody = document.getElementById('section-body');
        var editBtn = document.getElementById('edit-btn');
        var editActions = document.getElementById('edit-actions');
        var tabBtns = document.querySelectorAll('.tab-btn');

        if (!sectionBody) return;

        originalMarkdown = sectionBody.getAttribute('data-original-html') || '';
        originalHtml = sectionBody.innerHTML;

        sectionBody.contentEditable = 'true';
        sectionBody.classList.add('editing');
        addHeadingToolbars();

        tabBtns.forEach(function (b) { b.classList.remove('active'); });

        isEditMode = true;
        editBtn.textContent = '编辑中...';
        editBtn.disabled = true;
        editActions.style.display = '';

        sectionBody.focus();
    }

    function exitEditMode() {
        var sectionBody = document.getElementById('section-body');
        var editBtn = document.getElementById('edit-btn');
        var editActions = document.getElementById('edit-actions');
        var tabBtns = document.querySelectorAll('.tab-btn');

        removeHeadingToolbars();
        sectionBody.contentEditable = 'false';
        sectionBody.classList.remove('editing');
        editActions.style.display = 'none';

        var tabKeypoints = document.getElementById('tab-keypoints');
        var tabExercises = document.getElementById('tab-exercises');
        var tabOriginal = document.getElementById('tab-original');
        if (tabKeypoints) tabKeypoints.classList.remove('active');
        if (tabExercises) tabExercises.classList.remove('active');
        if (tabOriginal) tabOriginal.classList.add('active');

        var contentTab = document.querySelector('.tab-btn[data-tab="content"]');
        if (contentTab) {
            tabBtns.forEach(function (b) { b.classList.remove('active'); });
            contentTab.classList.add('active');
        }

        isEditMode = false;
        editBtn.textContent = '编辑';
        editBtn.disabled = false;
        editBtn.style.display = '';
    }

    function saveEdit() {
        var sectionData = window.SECTION_DATA;
        if (!sectionData || !sectionData.id) return;

        var sectionBody = document.getElementById('section-body');
        if (!sectionBody) return;

        removeHeadingToolbars();
        var markdown = htmlToMarkdown(sectionBody);

        fetch('/api/section/' + sectionData.id + '/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: markdown })
        })
        .then(function (resp) { return resp.json(); })
        .then(function (data) {
            if (data.success) {
                sectionBody.setAttribute('data-original-html', markdown);
                sectionBody.innerHTML = markdown;
                renderMarkdown();
                exitEditMode();
            } else {
                addHeadingToolbars();
                alert('保存失败: ' + (data.error || '未知错误'));
            }
        })
        .catch(function (err) {
            addHeadingToolbars();
            alert('保存失败: ' + err.message);
        });
    }

    function cancelEdit() {
        if (confirm('确定要取消编辑吗？未保存的修改将丢失。')) {
            var sectionBody = document.getElementById('section-body');
            sectionBody.innerHTML = originalHtml;
            exitEditMode();
        }
    }


    window.addEventListener('scroll', function () {
        if (document.documentElement.scrollTop !== 0) {
            document.documentElement.scrollTop = 0;
        }
        if (document.body.scrollTop !== 0) {
            document.body.scrollTop = 0;
        }
    }, { passive: false });

    function handleAnchorScroll() {
        var hash = window.location.hash;
        if (!hash) return;

        resetAllScrollPositions();

        var attempts = 0;
        var maxAttempts = 20;
        function tryScroll() {
            var target = document.querySelector(hash);
            if (target) {
                var cardBody = target.closest('.card-body');
                if (cardBody) {
                    resetAllScrollPositions();
                    cardBody.scrollTop = 0;
                    var targetRect = target.getBoundingClientRect();
                    var bodyRect = cardBody.getBoundingClientRect();
                    var targetTop = targetRect.top - bodyRect.top;
                    cardBody.scrollTop = targetTop - 20;
                }
                return;
            }
            attempts++;
            if (attempts < maxAttempts) {
                requestAnimationFrame(tryScroll);
            }
        }
        requestAnimationFrame(tryScroll);
    }

    function resetAllScrollPositions() {
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        var containers = document.querySelectorAll('.main-container, .content-area, .section-content');
        containers.forEach(function (el) { el.scrollTop = 0; });
    }

    window.addEventListener('hashchange', function () {
        handleAnchorScroll();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
