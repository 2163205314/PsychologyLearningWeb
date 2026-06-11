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
                renderMathInContainer(tocTree);
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
                            renderMathInContainer(bookSearchResults);
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
                }

                if (editBtn) editBtn.style.display = '';
                updateExerciseSubmitButton();
            });
        });
    }

    var keypointsLoaded = false;
    var exercisesLoaded = false;
    var currentExerciseQuestions = [];

    function loadKeypoints(callback) {
        if (keypointsLoaded) {
            if (callback) callback();
            return;
        }
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
                    html += '<div class="keypoint-item" data-pid="' + p.id + '" data-point-text="' + escapeAttribute(p.point_text || '') + '" data-detail="' + escapeAttribute(p.detail || '') + '">';
                    html += '<div class="keypoint-header">';
                    html += '<span class="keypoint-num">' + (i + 1) + '</span>';
                    html += '<span class="keypoint-title">' + renderFormattedText(p.point_text || '', 'inline') + '</span>';
                    html += '<span class="keypoint-stars">' + stars + '</span>';
                    html += '</div>';
                    html += '<div class="keypoint-detail">' + renderFormattedText(p.detail || '', 'block') + '</div>';
                    html += '</div>';
                });
                html += '</div>';
                container.innerHTML = html;
                keypointsLoaded = true;
                if (callback) callback();
            })
            .catch(function() {
                container.innerHTML = '<div class="keypoints-loading">加载失败，请重试</div>';
            });
    }

    function loadExercises(callback) {
        if (exercisesLoaded) {
            if (callback) callback();
            return;
        }
        var sectionData = window.SECTION_DATA;
        if (!sectionData || !sectionData.id) return;

        var container = document.getElementById('tab-exercises');
        if (!container) return;

        container.innerHTML = '<div class="exercises-loading">加载习题中...</div>';

        fetch('/api/section/' + sectionData.id + '/questions')
            .then(function(r) { return r.json(); })
            .then(function(questions) {
                currentExerciseQuestions = questions || [];
                if (questions.length === 0) {
                    container.innerHTML = '<div class="exercises-loading">暂无习题数据</div>';
                    updateExerciseSubmitButton();
                    return;
                }
                var html = '<div class="exercises-list">';
                questions.forEach(function(q, i) {
                    html += '<div class="question-block" data-qid="' + q.id + '" data-question-type="' + escapeAttribute(q.question_type || '') + '" data-is-multi="' + (isMultipleChoiceQuestion(q) ? '1' : '0') + '">';
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
                updateExerciseSubmitButton();
                if (callback) callback();
            })
            .catch(function() {
                container.innerHTML = '<div class="exercises-loading">加载失败，请重试</div>';
            });
    }

    function parseQuestionOptions(optionsValue) {
        if (!optionsValue) return [];
        if (Array.isArray(optionsValue)) return optionsValue;

        try {
            var parsed = JSON.parse(optionsValue);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch (e) {}

        return String(optionsValue).split(/\r?\n/).map(function(line) {
            return line.trim();
        }).filter(Boolean);
    }

    function formatQuestionOptionsForEditor(optionsValue) {
        return parseQuestionOptions(optionsValue).join('\n');
    }

    function normalizeQuestionOptionsForSave(questionType, rawValue) {
        if (questionType !== 'choice') return null;
        var options = parseQuestionOptions(rawValue);
        if (!options.length) return null;

        var labels = ['A', 'B', 'C', 'D', 'E', 'F'];
        var normalized = options.map(function(option, index) {
            var cleaned = String(option).trim().replace(/^[A-Fa-f][\.、)）\s]+/, '').trim();
            return labels[index] + '. ' + cleaned;
        });
        return JSON.stringify(normalized);
    }

    function stripOptionLabel(option, fallbackLabel) {
        var raw = String(option || '').trim();
        var matched = raw.match(/^([A-Fa-f])[\.、)）\s]+([\s\S]*)$/);
        if (matched) {
            return {
                label: matched[1].toUpperCase(),
                content: matched[2].trim()
            };
        }
        return {
            label: fallbackLabel,
            content: raw
        };
    }

    function renderAnswerReveal(q) {
        var html = '<div class="answer-reveal" id="answer-' + q.id + '">';
        html += '<strong>正确答案：</strong><span class="answer-value">' + renderFormattedText(q.answer || '', 'inline') + '</span>';
        if (q.explanation) {
            html += '<div class="answer-explanation">' + renderFormattedText(q.explanation, 'block') + '</div>';
        }
        html += '</div>';
        return html;
    }

    function isMultipleChoiceQuestion(q) {
        if (!q) return false;
        var answer = String(q.answer || '').trim();
        var stem = String(q.question_text || '');
        return answer.indexOf(',') !== -1 || stem.indexOf('【多选题】') !== -1;
    }

    function renderChoiceQuestion(q, num) {
        var html = '';
        html += '<div class="question-stem"><span class="question-num">' + num + '.</span><span class="question-stem-content">' + renderFormattedText(q.question_text || '', 'inline') + '</span></div>';

        var options = parseQuestionOptions(q.options);
        if (options.length) {
            html += '<div class="question-options">';
            options.forEach(function(opt, oi) {
                var fallbackLabel = String.fromCharCode(65 + oi);
                var optionMeta = stripOptionLabel(opt, fallbackLabel);
                html += '<div class="option-item" data-answer="' + optionMeta.label + '">';
                html += '<span class="option-label">' + optionMeta.label + '</span>';
                html += '<span class="option-content">' + renderFormattedText(optionMeta.content, 'inline') + '</span>';
                html += '</div>';
            });
            html += '</div>';
        }

        html += renderAnswerReveal(q);
        return html;
    }

    function renderFillBlankQuestion(q, num) {
        var html = '';
        var placeholder = '@@BLANK_' + q.id + '@@';
        var stemSource = (q.question_text || '').replace(/_{4,}/g, placeholder);
        var stemHtml = renderFormattedText(stemSource, 'inline').split(placeholder).join('<input type="text" class="fill-blank-input" data-answer-id="' + q.id + '" placeholder="?">');
        html += '<div class="question-stem"><span class="question-num">' + num + '.</span><span class="question-stem-content">' + stemHtml + '</span></div>';
        html += renderAnswerReveal(q);
        return html;
    }

    function resetQuestionFeedback(block) {
        if (!block) return;
        block.classList.remove('question-correct');
        block.classList.remove('question-wrong');
        block.querySelectorAll('.option-item').forEach(function(item) {
            item.classList.remove('correct');
            item.classList.remove('wrong');
        });
        block.querySelectorAll('.fill-blank-input').forEach(function(input) {
            input.classList.remove('correct');
            input.classList.remove('wrong');
        });
        var answerReveal = block.querySelector('.answer-reveal');
        if (answerReveal) answerReveal.classList.remove('show');
    }

    function bindExerciseEvents() {
        var choiceItems = document.querySelectorAll('.option-item');
        choiceItems.forEach(function(item) {
            item.addEventListener('click', function() {
                if (isEditMode) return;
                var block = this.closest('.question-block');
                if (!block) return;

                resetQuestionFeedback(block);

                var isMulti = block.getAttribute('data-is-multi') === '1';
                if (isMulti) {
                    this.classList.toggle('selected');
                } else {
                    block.querySelectorAll('.option-item').forEach(function(it) {
                        if (it !== item) it.classList.remove('selected');
                    });
                    this.classList.toggle('selected');
                }
            });
        });

        var blankInputs = document.querySelectorAll('.fill-blank-input');
        blankInputs.forEach(function(input) {
            input.addEventListener('input', function() {
                var block = input.closest('.question-block');
                resetQuestionFeedback(block);
            });
        });
    }

    function collectExerciseAnswers() {
        var blocks = document.querySelectorAll('.question-block');
        var answers = [];
        blocks.forEach(function(block) {
            var qid = block.getAttribute('data-qid');
            var questionType = block.getAttribute('data-question-type');
            if (!qid || !questionType) return;

            if (questionType === 'choice') {
                var selectedOptions = [];
                block.querySelectorAll('.option-item.selected').forEach(function(item) {
                    selectedOptions.push(item.getAttribute('data-answer'));
                });
                answers.push({ question_id: parseInt(qid, 10), selected_options: selectedOptions });
            } else if (questionType === 'fill_blank') {
                var blanks = [];
                block.querySelectorAll('.fill-blank-input').forEach(function(input) {
                    blanks.push((input.value || '').trim());
                });
                answers.push({ question_id: parseInt(qid, 10), blanks: blanks });
            }
        });
        return answers;
    }

    function applyExerciseResults(results) {
        (results || []).forEach(function(result) {
            var block = document.querySelector('.question-block[data-qid="' + result.question_id + '"]');
            if (!block) return;

            resetQuestionFeedback(block);
            block.classList.add(result.is_correct ? 'question-correct' : 'question-wrong');

            if (result.question_type === 'choice') {
                var correctAnswers = result.correct_answer || [];
                var selectedOptions = result.selected_options || [];
                block.querySelectorAll('.option-item').forEach(function(item) {
                    var answer = item.getAttribute('data-answer');
                    if (correctAnswers.indexOf(answer) !== -1) {
                        item.classList.add('correct');
                    } else if (selectedOptions.indexOf(answer) !== -1) {
                        item.classList.add('wrong');
                    }
                });
            } else if (result.question_type === 'fill_blank') {
                var inputs = block.querySelectorAll('.fill-blank-input');
                inputs.forEach(function(input, index) {
                    var isCorrect = result.blank_results && result.blank_results[index];
                    input.classList.add(isCorrect ? 'correct' : 'wrong');
                });
            }

            var answerReveal = block.querySelector('.answer-reveal');
            if (answerReveal) answerReveal.classList.add('show');
        });
    }

    function updateExerciseSubmitButton() {
        var submitBtn = document.getElementById('submit-btn');
        if (!submitBtn) return;
        var activeTab = document.querySelector('.tab-btn.active');
        var activeKey = activeTab ? activeTab.getAttribute('data-tab') : 'content';
        var hasQuestions = currentExerciseQuestions && currentExerciseQuestions.length > 0;
        submitBtn.style.display = (!isEditMode && activeKey === 'exercises' && hasQuestions) ? '' : 'none';
    }

    function submitExerciseAnswers() {
        if (isEditMode) return;
        var sectionData = window.SECTION_DATA;
        if (!sectionData || !sectionData.id) return;
        if (!currentExerciseQuestions || currentExerciseQuestions.length === 0) {
            alert('当前章节暂无习题可提交');
            return;
        }

        var answers = collectExerciseAnswers();
        var submitBtn = document.getElementById('submit-btn');
        if (submitBtn) submitBtn.disabled = true;

        fetch('/api/section/' + sectionData.id + '/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ answers: answers })
        })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (!data.success) {
                    throw new Error(data.error || '提交失败');
                }
                applyExerciseResults(data.results || []);

                var totalCount = data.total_count || 0;
                var correctCount = data.correct_count || 0;
                var incorrectCount = data.incorrect_count || 0;
                var summaryText = '本次共 ' + totalCount + ' 题，答对 ' + correctCount + ' 题，答错 ' + incorrectCount + ' 题。';

                if (data.all_correct) {
                    alert(summaryText + (data.progress_updated ? ' 本节习题全部答对，学习进度已增加 1。' : ' 本节习题全部答对，本节学习进度已完成。'));
                } else {
                    alert(summaryText + ' 你可以直接修改题目上的答案后再次提交。');
                }
            })
            .catch(function(err) {
                alert('提交失败: ' + err.message);
            })
            .finally(function() {
                if (submitBtn) submitBtn.disabled = false;
            });
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function escapeAttribute(text) {
        return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getMathRenderOptions() {
        return {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\[', right: '\\]', display: true },
                { left: '\\(', right: '\\)', display: false }
            ],
            throwOnError: false,
            ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
        };
    }

    function renderMathInContainer(element) {
        if (!element || typeof renderMathInElement === 'undefined') return;
        renderMathInElement(element, getMathRenderOptions());
    }

    function normalizeImageSources(scope) {
        if (!scope) return;
        var imgs = scope.querySelectorAll('img');
        imgs.forEach(function(img) {
            var src = img.getAttribute('src');
            if (src && src.indexOf('images/') === 0) {
                img.setAttribute('src', '/' + src);
            }
        });
    }

    function protectMathExpressions(text) {
        var source = text || '';
        var tokens = [];
        var result = '';
        var i = 0;

        function pushToken(segment) {
            var token = '@@MATH_TOKEN_' + tokens.length + '@@';
            tokens.push(segment);
            result += token;
        }

        function findClosingPair(input, startIndex, left, right) {
            var index = startIndex;
            while (index < input.length) {
                var found = input.indexOf(right, index);
                if (found === -1) return -1;
                if (input.charAt(found - 1) !== '\\') return found;
                index = found + right.length;
            }
            return -1;
        }

        function findClosingDollar(input, startIndex) {
            var index = startIndex;
            while (index < input.length) {
                var found = input.indexOf('$', index);
                if (found === -1) return -1;
                if (input.charAt(found - 1) !== '\\' && input.charAt(found + 1) !== '$') {
                    return found;
                }
                index = found + 1;
            }
            return -1;
        }

        while (i < source.length) {
            if (source.slice(i, i + 3) === '```') {
                var fenceEnd = source.indexOf('```', i + 3);
                if (fenceEnd === -1) {
                    result += source.slice(i);
                    break;
                }
                result += source.slice(i, fenceEnd + 3);
                i = fenceEnd + 3;
                continue;
            }

            if (source.charAt(i) === '`') {
                var codeEnd = source.indexOf('`', i + 1);
                if (codeEnd === -1) {
                    result += source.slice(i);
                    break;
                }
                result += source.slice(i, codeEnd + 1);
                i = codeEnd + 1;
                continue;
            }

            if (source.slice(i, i + 2) === '$$') {
                var displayEnd = findClosingPair(source, i + 2, '$$', '$$');
                if (displayEnd !== -1) {
                    pushToken(source.slice(i, displayEnd + 2));
                    i = displayEnd + 2;
                    continue;
                }
            }

            if (source.slice(i, i + 2) === '\\[') {
                var bracketEnd = findClosingPair(source, i + 2, '\\[', '\\]');
                if (bracketEnd !== -1) {
                    pushToken(source.slice(i, bracketEnd + 2));
                    i = bracketEnd + 2;
                    continue;
                }
            }

            if (source.slice(i, i + 2) === '\\(') {
                var parenEnd = findClosingPair(source, i + 2, '\\(', '\\)');
                if (parenEnd !== -1) {
                    pushToken(source.slice(i, parenEnd + 2));
                    i = parenEnd + 2;
                    continue;
                }
            }

            if (source.charAt(i) === '$' && source.charAt(i + 1) !== '$') {
                var inlineEnd = findClosingDollar(source, i + 1);
                if (inlineEnd !== -1) {
                    pushToken(source.slice(i, inlineEnd + 1));
                    i = inlineEnd + 1;
                    continue;
                }
            }

            result += source.charAt(i);
            i += 1;
        }

        return {
            text: result,
            tokens: tokens
        };
    }

    function restoreMathExpressions(html, tokens) {
        var restored = html;
        tokens.forEach(function(tokenValue, index) {
            var token = '@@MATH_TOKEN_' + index + '@@';
            restored = restored.split(token).join(tokenValue);
        });
        return restored;
    }

    function renderFormattedText(source, mode) {
        var protectedMath = protectMathExpressions(source || '');
        var html = mode === 'inline'
            ? marked.parseInline(protectedMath.text)
            : marked.parse(protectedMath.text);
        html = restoreMathExpressions(html, protectedMath.tokens);

        var wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        normalizeImageSources(wrapper);
        renderMathInContainer(wrapper);
        return wrapper.innerHTML;
    }

    /* ===== Markdown渲染 + KaTeX ===== */
    function renderMarkdown() {
        var body = document.getElementById('section-body');
        if (!body) return;

        var raw = body.getAttribute('data-original-html') || body.textContent || '';
        body.innerHTML = renderFormattedText(raw.trim(), 'block');
    }

    function renderStaticMath() {
        renderMathInContainer(document.querySelector('.breadcrumb'));
        renderMathInContainer(document.getElementById('toc-tree'));
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

    function initHomeProgressReset() {
        var resetButtons = document.querySelectorAll('.book-reset-btn');
        if (!resetButtons.length) return;

        resetButtons.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();

                var bookId = btn.getAttribute('data-book-id');
                var bookTitle = btn.getAttribute('data-book-title') || '当前模块';
                if (!bookId) return;
                if (!confirm('确定要将“' + bookTitle + '”的学习进度清零吗？')) return;

                btn.disabled = true;
                fetch('/api/book/' + bookId + '/progress/reset', {
                    method: 'POST'
                })
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (!data.success) {
                            throw new Error(data.error || '清零失败');
                        }
                        window.location.reload();
                    })
                    .catch(function(err) {
                        btn.disabled = false;
                        alert('清零失败: ' + err.message);
                    });
            });
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
        renderStaticMath();
        renderMarkdown();
        initTabs();
        initHomeProgressReset();
        initEditMode();
        initFormattingToolbar();
        initModal();
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
    var editTab = '';
    var originalHtml = '';
    var savedScrollTop = 0;
    var pendingKeypointDeletes = [];
    var pendingQuestionDeletes = [];

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
            if (tag === 'span') {
                var sid = n.getAttribute('id');
                if (sid && sid.indexOf('section-') === 0) {
                    return '<span id="' + sid + '"></span>';
                }
                var style = n.getAttribute('style') || '';
                if (style.indexOf('background-color') !== -1) {
                    return '<mark>' + processChildren(n) + '</mark>';
                }
                return processChildren(n);
            }
            if (tag === 'mark') return '<mark>' + processChildren(n) + '</mark>';
            if (tag === 'u') return '<u>' + processChildren(n) + '</u>';
            if (tag === 'div' || tag === 'code') {
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
        upBtn.innerHTML = '&#8593;';
        upBtn.title = '升级标题';
        upBtn.disabled = level <= 1;
        upBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (level > 1) {
                changeHeadingLevel(heading, level - 1);
            }
        });

        var downBtn = document.createElement('button');
        downBtn.innerHTML = '&#8595;';
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
        var toolbar = heading.querySelector('.heading-toolbar');
        if (toolbar) toolbar.remove();
        var content = heading.innerHTML;
        var newHeading = document.createElement('h' + newLevel);
        newHeading.innerHTML = content;
        heading.parentNode.replaceChild(newHeading, heading);
        createHeadingToolbar(newHeading);
    }

    function addHeadingToolbars() {
        var sectionBody = document.getElementById('section-body');
        if (!sectionBody) return;
        var headings = sectionBody.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(function (heading) {
            if (!heading.querySelector('.heading-toolbar')) {
                createHeadingToolbar(heading);
            }
        });
    }

    function removeHeadingToolbars() {
        var sectionBody = document.getElementById('section-body');
        if (!sectionBody) return;
        var toolbars = sectionBody.querySelectorAll('.heading-toolbar');
        toolbars.forEach(function (tb) { tb.remove(); });
    }

    function initEditMode() {
        var editBtn = document.getElementById('edit-btn');
        var saveBtn = document.getElementById('save-btn');
        var cancelBtn = document.getElementById('cancel-btn');
        var submitBtn = document.getElementById('submit-btn');

        if (!editBtn) return;

        editBtn.addEventListener('click', function () {
            enterEditMode();
        });

        if (submitBtn) {
            submitBtn.addEventListener('click', function () {
                submitExerciseAnswers();
            });
        }

        saveBtn.addEventListener('click', function () {
            saveEdit();
        });

        cancelBtn.addEventListener('click', function () {
            cancelEdit();
        });

        var contentInput = document.getElementById('content-editor-input');
        if (contentInput) {
            contentInput.addEventListener('input', renderContentEditorPreview);
        }
    }

    function getActiveEditContainer() {
        var activeTab = document.querySelector('.tab-content.active');
        if (!activeTab) return null;
        if (activeTab.id === 'tab-original') return document.getElementById('content-editor-input') || document.getElementById('section-body');
        if (activeTab.id === 'tab-keypoints') return activeTab;
        if (activeTab.id === 'tab-exercises') return activeTab;
        return null;
    }

    function getContentEditorElements() {
        return {
            body: document.getElementById('section-body'),
            editor: document.getElementById('content-editor'),
            input: document.getElementById('content-editor-input'),
            preview: document.getElementById('content-editor-preview')
        };
    }

    function renderContentEditorPreview() {
        var elements = getContentEditorElements();
        if (!elements.preview || !elements.input) return;
        elements.preview.innerHTML = renderFormattedText(elements.input.value || '', 'block');
    }

    function enterEditMode() {
        if (isEditMode) return;

        var editBtn = document.getElementById('edit-btn');
        var saveBtn = document.getElementById('save-btn');
        var cancelBtn = document.getElementById('cancel-btn');
        var toolbar = document.getElementById('formatting-toolbar');
        var cardBody = document.querySelector('.card-body');
        var tabBtns = document.querySelectorAll('.tab-btn');

        var activeTab = document.querySelector('.tab-btn.active');
        editTab = activeTab ? activeTab.getAttribute('data-tab') : 'content';

        savedScrollTop = cardBody ? cardBody.scrollTop : 0;

        if (editTab === 'content') {
            var contentElements = getContentEditorElements();
            if (!contentElements.body || !contentElements.editor || !contentElements.input) return;

            originalHtml = contentElements.body.getAttribute('data-original-html') || '';
            contentElements.input.value = originalHtml;
            contentElements.body.style.display = 'none';
            contentElements.editor.style.display = 'grid';
            renderContentEditorPreview();
            finishEnterEditMode(editBtn, saveBtn, cancelBtn, toolbar, cardBody, tabBtns);
            requestAnimationFrame(function () {
                contentElements.input.focus();
            });
        } else if (editTab === 'keypoints') {
            if (keypointsLoaded) {
                doEnterKeypointsEdit(editBtn, saveBtn, cancelBtn, toolbar, cardBody, tabBtns);
            } else {
                loadKeypoints(function () {
                    doEnterKeypointsEdit(editBtn, saveBtn, cancelBtn, toolbar, cardBody, tabBtns);
                });
            }
        } else if (editTab === 'exercises') {
            if (exercisesLoaded) {
                doEnterExercisesEdit(editBtn, saveBtn, cancelBtn, toolbar, cardBody, tabBtns);
            } else {
                loadExercises(function () {
                    doEnterExercisesEdit(editBtn, saveBtn, cancelBtn, toolbar, cardBody, tabBtns);
                });
            }
        }
    }

    function doEnterKeypointsEdit(editBtn, saveBtn, cancelBtn, toolbar, cardBody, tabBtns) {
        var kpContainer = document.getElementById('tab-keypoints');
        originalHtml = kpContainer ? kpContainer.innerHTML : '';
        if (kpContainer) {
            kpContainer.classList.add('editing');
            makeKeypointsEditable();
        }
        finishEnterEditMode(editBtn, saveBtn, cancelBtn, toolbar, cardBody, tabBtns);
    }

    function doEnterExercisesEdit(editBtn, saveBtn, cancelBtn, toolbar, cardBody, tabBtns) {
        var exContainer = document.getElementById('tab-exercises');
        originalHtml = exContainer ? exContainer.innerHTML : '';
        if (exContainer) {
            exContainer.classList.add('editing');
            makeExercisesEditable();
        }
        finishEnterEditMode(editBtn, saveBtn, cancelBtn, toolbar, cardBody, tabBtns);
    }

    function finishEnterEditMode(editBtn, saveBtn, cancelBtn, toolbar, cardBody, tabBtns) {
        tabBtns.forEach(function (b) { b.classList.remove('active'); });
        var currentTabBtn = document.querySelector('.tab-btn[data-tab="' + editTab + '"]');
        if (currentTabBtn) currentTabBtn.classList.add('active');

        isEditMode = true;
        editBtn.style.display = 'none';
        saveBtn.style.display = '';
        cancelBtn.style.display = '';

        if (toolbar) {
            toolbar.style.display = '';
            updateToolbarButtons();
        }

        updateExerciseSubmitButton();

        if (cardBody) {
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    cardBody.scrollTop = savedScrollTop;
                });
            });
        }
    }

    function updateToolbarButtons() {
        var toolAddKeypoint = document.getElementById('tool-add-keypoint');
        var toolAddQuestion = document.getElementById('tool-add-question');
        var toolInlineMath = document.getElementById('tool-inline-math');
        var toolBlockMath = document.getElementById('tool-block-math');

        if (toolAddKeypoint) toolAddKeypoint.style.display = (editTab === 'keypoints') ? '' : 'none';
        if (toolAddQuestion) toolAddQuestion.style.display = (editTab === 'exercises') ? '' : 'none';
        if (toolInlineMath) toolInlineMath.style.display = (editTab === 'content') ? '' : 'none';
        if (toolBlockMath) toolBlockMath.style.display = (editTab === 'content') ? '' : 'none';
    }

    function makeKeypointsEditable() {
        var container = document.getElementById('tab-keypoints');
        if (!container) return;

        var items = container.querySelectorAll('.keypoint-item');
        items.forEach(function (item) {
            var titleEl = item.querySelector('.keypoint-title');
            var detailEl = item.querySelector('.keypoint-detail');
            var rawTitle = item.getAttribute('data-point-text') || '';
            var rawDetail = item.getAttribute('data-detail') || '';

            if (titleEl) {
                titleEl.textContent = rawTitle;
                titleEl.contentEditable = 'true';
            }
            if (detailEl) {
                detailEl.textContent = rawDetail;
                detailEl.contentEditable = 'true';
            }

            if (!item.querySelector('.kp-delete-btn')) {
                var delBtn = document.createElement('button');
                delBtn.className = 'kp-delete-btn';
                delBtn.innerHTML = '&times;';
                delBtn.title = '删除考点';
                delBtn.addEventListener('click', function () {
                    var pid = item.getAttribute('data-pid');
                    if (pid) {
                        pendingKeypointDeletes.push(parseInt(pid, 10));
                        item.style.display = 'none';
                    }
                });
                item.appendChild(delBtn);
            }
        });

        container.querySelectorAll('.keypoint-stars').forEach(function (stars) {
            stars.contentEditable = 'false';
        });
    }

    function makeExercisesEditable() {
        var container = document.getElementById('tab-exercises');
        if (!container) return;

        var blocks = container.querySelectorAll('.question-block');
        blocks.forEach(function (block) {
            var delBtn = document.createElement('button');
            delBtn.className = 'q-delete-btn';
            delBtn.innerHTML = '&times;';
            delBtn.title = '删除习题';
            delBtn.addEventListener('click', function () {
                var qid = block.getAttribute('data-qid');
                if (qid) {
                    pendingQuestionDeletes.push(parseInt(qid));
                    block.style.display = 'none';
                }
            });
            block.appendChild(delBtn);

            var stem = block.querySelector('.question-stem');
            if (stem) {
                var stemText = stem.querySelector('.question-num');
                var editBtn2 = document.createElement('button');
                editBtn2.className = 'q-edit-btn';
                editBtn2.innerHTML = '编辑';
                editBtn2.title = '编辑习题';
                editBtn2.addEventListener('click', function () {
                    var qid = block.getAttribute('data-qid');
                    openQuestionEditModal(qid);
                });
                stem.appendChild(editBtn2);
            }
        });
    }

    function exitEditMode() {
        var editBtn = document.getElementById('edit-btn');
        var saveBtn = document.getElementById('save-btn');
        var cancelBtn = document.getElementById('cancel-btn');
        var toolbar = document.getElementById('formatting-toolbar');
        var tabBtns = document.querySelectorAll('.tab-btn');
        var cardBody = document.querySelector('.card-body');

        if (toolbar) toolbar.style.display = 'none';

        if (editTab === 'content') {
            var contentElements = getContentEditorElements();
            if (contentElements.editor) contentElements.editor.style.display = 'none';
            if (contentElements.body) contentElements.body.style.display = '';
        } else if (editTab === 'keypoints') {
            var kpContainer = document.getElementById('tab-keypoints');
            if (kpContainer) {
                kpContainer.classList.remove('editing');
                kpContainer.querySelectorAll('.kp-delete-btn').forEach(function (b) { b.remove(); });
                kpContainer.querySelectorAll('.keypoint-title, .keypoint-detail').forEach(function (el) {
                    el.contentEditable = 'false';
                });
            }
        } else if (editTab === 'exercises') {
            var exContainer = document.getElementById('tab-exercises');
            if (exContainer) {
                exContainer.classList.remove('editing');
                exContainer.querySelectorAll('.q-delete-btn, .q-edit-btn').forEach(function (b) { b.remove(); });
            }
        }

        isEditMode = false;
        editBtn.style.display = '';
        saveBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        updateExerciseSubmitButton();

        if (cardBody) {
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    cardBody.scrollTop = savedScrollTop;
                });
            });
        }
    }

    function saveEdit() {
        var sectionData = window.SECTION_DATA;
        if (!sectionData || !sectionData.id) return;

        if (editTab === 'content') {
            saveContentEdit(sectionData);
        } else if (editTab === 'keypoints') {
            saveKeypointsEdit(sectionData);
        } else if (editTab === 'exercises') {
            saveExercisesEdit(sectionData);
        }
    }

    function saveContentEdit(sectionData) {
        var contentElements = getContentEditorElements();
        if (!contentElements.body || !contentElements.input) return;

        var markdown = contentElements.input.value;

        fetch('/api/section/' + sectionData.id + '/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: markdown })
        })
        .then(function (resp) { return resp.json(); })
        .then(function (data) {
            if (data.success) {
                contentElements.body.setAttribute('data-original-html', markdown);
                renderMarkdown();
                exitEditMode();
            } else {
                alert('保存失败: ' + (data.error || '未知错误'));
            }
        })
        .catch(function (err) {
            alert('保存失败: ' + err.message);
        });
    }

    function saveKeypointsEdit(sectionData) {
        var container = document.getElementById('tab-keypoints');
        if (!container) return;

        var promises = [];

        var items = container.querySelectorAll('.keypoint-item');
        items.forEach(function (item) {
            var pid = item.getAttribute('data-pid');
            if (!pid || item.style.display === 'none') return;

            var titleEl = item.querySelector('.keypoint-title');
            var detailEl = item.querySelector('.keypoint-detail');
            var pointText = titleEl ? titleEl.innerText.trim() : '';
            var detail = detailEl ? detailEl.innerText.trim() : '';

            if (pointText) {
                promises.push(
                    fetch('/api/point/' + pid, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ point_text: pointText, detail: detail })
                    })
                );
            }
        });

        pendingKeypointDeletes.forEach(function (pid) {
            promises.push(
                fetch('/api/point/' + pid, { method: 'DELETE' })
            );
        });

        Promise.all(promises)
            .then(function () {
                pendingKeypointDeletes = [];
                keypointsLoaded = false;
                loadKeypoints(exitEditMode);
            })
            .catch(function (err) {
                alert('保存失败: ' + err.message);
            });
    }

    function saveExercisesEdit(sectionData) {
        var promises = [];

        pendingQuestionDeletes.forEach(function (qid) {
            promises.push(
                fetch('/api/question/' + qid, { method: 'DELETE' })
            );
        });

        Promise.all(promises)
            .then(function () {
                pendingQuestionDeletes = [];
                exercisesLoaded = false;
                loadExercises(exitEditMode);
            })
            .catch(function (err) {
                alert('保存失败: ' + err.message);
            });
    }

    function cancelEdit() {
        if (!confirm('确定要取消编辑吗？未保存的修改将丢失。')) return;

        if (editTab === 'content') {
            var contentElements = getContentEditorElements();
            if (contentElements.input) contentElements.input.value = originalHtml;
            renderContentEditorPreview();
            renderMarkdown();
        } else if (editTab === 'keypoints') {
            var kpContainer = document.getElementById('tab-keypoints');
            if (kpContainer && originalHtml) kpContainer.innerHTML = originalHtml;
        } else if (editTab === 'exercises') {
            var exContainer = document.getElementById('tab-exercises');
            if (exContainer && originalHtml) exContainer.innerHTML = originalHtml;
            bindExerciseEvents();
        }

        pendingKeypointDeletes = [];
        pendingQuestionDeletes = [];
        exitEditMode();
    }

    function insertTextAroundSelection(input, prefix, suffix, placeholder) {
        if (!input) return;

        var start = input.selectionStart || 0;
        var end = input.selectionEnd || 0;
        var value = input.value || '';
        var selected = value.slice(start, end);
        var inner = selected || (placeholder || '内容');
        var replacement = prefix + inner + suffix;

        input.value = value.slice(0, start) + replacement + value.slice(end);
        var cursorStart = start + prefix.length;
        var cursorEnd = cursorStart + inner.length;
        input.focus();
        input.setSelectionRange(cursorStart, cursorEnd);
        renderContentEditorPreview();
    }

    function initFormattingToolbar() {
        var toolbar = document.getElementById('formatting-toolbar');
        if (!toolbar) return;

        toolbar.addEventListener('click', function (e) {
            var btn = e.target.closest('.tool-btn');
            if (!btn) return;

            var action = btn.getAttribute('data-action');
            var contentInput = document.getElementById('content-editor-input');

            if (action === 'bold') {
                if (editTab === 'content') {
                    insertTextAroundSelection(contentInput, '**', '**', '加粗文字');
                }
            } else if (action === 'highlight') {
                if (editTab === 'content') {
                    insertTextAroundSelection(contentInput, '<mark>', '</mark>', '高亮文字');
                }
            } else if (action === 'underline') {
                if (editTab === 'content') {
                    insertTextAroundSelection(contentInput, '<u>', '</u>', '下划线文字');
                }
            } else if (action === 'insert-inline-math') {
                insertTextAroundSelection(contentInput, '$', '$', 'x^2');
            } else if (action === 'insert-block-math') {
                insertTextAroundSelection(contentInput, '$$\n', '\n$$', '\\chi^2 = \\sum \\frac{(f_o-f_e)^2}{f_e}');
            } else if (action === 'add-keypoint') {
                openKeypointModal();
            } else if (action === 'add-question') {
                openQuestionModal();
            }
        });

        document.addEventListener('keydown', function (e) {
            if (!isEditMode || editTab !== 'content') return;
            if (e.ctrlKey && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                insertTextAroundSelection(document.getElementById('content-editor-input'), '**', '**', '加粗文字');
            }
        });
    }

    function openKeypointModal() {
        var overlay = document.getElementById('modal-overlay');
        var form = document.getElementById('modal-keypoint-form');
        if (!overlay || !form) return;

        var qForm = document.getElementById('modal-question-form');
        if (qForm) qForm.style.display = 'none';

        document.getElementById('kp-point-text').value = '';
        document.getElementById('kp-detail').value = '';
        document.getElementById('kp-importance').value = '3';

        overlay.style.display = 'flex';
        form.style.display = 'block';
    }

    function closeKeypointModal() {
        var overlay = document.getElementById('modal-overlay');
        var form = document.getElementById('modal-keypoint-form');
        if (overlay) overlay.style.display = 'none';
        if (form) form.style.display = 'none';
    }

    function saveKeypointFromModal() {
        var sectionData = window.SECTION_DATA;
        var pointText = document.getElementById('kp-point-text').value.trim();
        var detail = document.getElementById('kp-detail').value.trim();
        var importance = parseInt(document.getElementById('kp-importance').value);

        if (!pointText) {
            alert('请输入考点名称');
            return;
        }

        fetch('/api/point', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                section_id: sectionData.id,
                point_text: pointText,
                detail: detail,
                importance: importance
            })
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.success) {
                closeKeypointModal();
                keypointsLoaded = false;
                loadKeypoints(function () {
                    makeKeypointsEditable();
                    rehidePendingKeypointDeletes();
                });
            } else {
                alert('添加失败: ' + (data.error || '未知错误'));
            }
        })
        .catch(function (err) {
            alert('添加失败: ' + err.message);
        });
    }

    function rehidePendingKeypointDeletes() {
        pendingKeypointDeletes.forEach(function (pid) {
            var item = document.querySelector('.keypoint-item[data-pid="' + pid + '"]');
            if (item) item.style.display = 'none';
        });
    }

    function rehidePendingQuestionDeletes() {
        pendingQuestionDeletes.forEach(function (qid) {
            var block = document.querySelector('.question-block[data-qid="' + qid + '"]');
            if (block) block.style.display = 'none';
        });
    }

    function initModal() {
        var overlay = document.getElementById('modal-overlay');
        if (!overlay) return;

        document.getElementById('modal-close').addEventListener('click', closeKeypointModal);
        document.getElementById('modal-cancel').addEventListener('click', closeKeypointModal);
        document.getElementById('modal-save').addEventListener('click', saveKeypointFromModal);

        document.getElementById('modal-q-close').addEventListener('click', closeQuestionModal);
        document.getElementById('modal-q-cancel').addEventListener('click', closeQuestionModal);
        document.getElementById('modal-q-save').addEventListener('click', saveQuestionFromModal);

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) {
                closeKeypointModal();
                closeQuestionModal();
            }
        });

        var qType = document.getElementById('q-type');
        if (qType) {
            qType.addEventListener('change', function () {
                var optsGroup = document.getElementById('q-options-group');
                if (optsGroup) {
                    optsGroup.style.display = this.value === 'choice' ? '' : 'none';
                }
            });
        }
    }

    function openQuestionModal() {
        var overlay = document.getElementById('modal-overlay');
        var form = document.getElementById('modal-question-form');
        if (!overlay || !form) return;

        var kpForm = document.getElementById('modal-keypoint-form');
        if (kpForm) kpForm.style.display = 'none';

        document.getElementById('modal-q-title').textContent = '新增习题';
        document.getElementById('q-type').value = 'choice';
        document.getElementById('q-text').value = '';
        document.getElementById('q-options').value = '';
        document.getElementById('q-answer').value = '';
        document.getElementById('q-explanation').value = '';
        document.getElementById('q-options-group').style.display = '';

        overlay.style.display = 'flex';
        form.style.display = 'block';
        form.removeAttribute('data-edit-id');
    }

    function openQuestionEditModal(qid) {
        var overlay = document.getElementById('modal-overlay');
        var form = document.getElementById('modal-question-form');
        if (!overlay || !form) return;

        var kpForm = document.getElementById('modal-keypoint-form');
        if (kpForm) kpForm.style.display = 'none';

        fetch('/api/section/' + window.SECTION_DATA.id + '/questions')
            .then(function (r) { return r.json(); })
            .then(function (questions) {
                var q = questions.find(function (qq) { return qq.id == qid; });
                if (!q) return;

                document.getElementById('modal-q-title').textContent = '编辑习题';
                document.getElementById('q-type').value = q.question_type;
                document.getElementById('q-text').value = q.question_text;
                document.getElementById('q-options').value = formatQuestionOptionsForEditor(q.options || '');
                document.getElementById('q-answer').value = q.answer;
                document.getElementById('q-explanation').value = q.explanation || '';
                document.getElementById('q-options-group').style.display = q.question_type === 'choice' ? '' : 'none';

                overlay.style.display = 'flex';
                form.style.display = 'block';
                form.setAttribute('data-edit-id', qid);
            });
    }

    function closeQuestionModal() {
        var overlay = document.getElementById('modal-overlay');
        var form = document.getElementById('modal-question-form');
        if (overlay) overlay.style.display = 'none';
        if (form) form.style.display = 'none';
    }

    function saveQuestionFromModal() {
        var sectionData = window.SECTION_DATA;
        var form = document.getElementById('modal-question-form');
        var editId = form ? form.getAttribute('data-edit-id') : null;

        var questionType = document.getElementById('q-type').value;
        var questionText = document.getElementById('q-text').value.trim();
        var options = document.getElementById('q-options').value.trim();
        var answer = document.getElementById('q-answer').value.trim();
        var explanation = document.getElementById('q-explanation').value.trim();
        var normalizedOptions = normalizeQuestionOptionsForSave(questionType, options);

        if (!questionText || !answer) {
            alert('请输入题目和答案');
            return;
        }

        if (questionType === 'choice' && !normalizedOptions) {
            alert('请输入选择题选项，支持每行一个选项');
            return;
        }

        if (editId) {
            fetch('/api/question/' + editId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question_text: questionText,
                    options: normalizedOptions,
                    answer: answer,
                    explanation: explanation
                })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    closeQuestionModal();
                    exercisesLoaded = false;
                    loadExercises(function () {
                        makeExercisesEditable();
                        rehidePendingQuestionDeletes();
                    });
                } else {
                    alert('更新失败: ' + (data.error || '未知错误'));
                }
            })
            .catch(function (err) {
                alert('更新失败: ' + err.message);
            });
        } else {
            fetch('/api/question', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    section_id: sectionData.id,
                    question_type: questionType,
                    question_text: questionText,
                    options: normalizedOptions,
                    answer: answer,
                    explanation: explanation
                })
            })
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.success) {
                    closeQuestionModal();
                    exercisesLoaded = false;
                    loadExercises(function () {
                        makeExercisesEditable();
                        rehidePendingQuestionDeletes();
                    });
                } else {
                    alert('添加失败: ' + (data.error || '未知错误'));
                }
            })
            .catch(function (err) {
                alert('添加失败: ' + err.message);
            });
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
