import sqlite3
import os
import re

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'psychology_learning.db')


def ensure_learning_progress_table():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS section_learning_progress (
            section_id INTEGER PRIMARY KEY,
            completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE
        )
    ''')
    conn.commit()
    conn.close()


ensure_learning_progress_table()


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_all_books():
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT id, title, short_name, sort_order FROM books ORDER BY sort_order')
    books = [dict(row) for row in c.fetchall()]
    conn.close()
    return books


def get_book(book_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT id, title, short_name, sort_order FROM books WHERE id = ?', (book_id,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None


def get_book_by_short_name(short_name):
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT id, title, short_name, sort_order FROM books WHERE short_name = ?', (short_name,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None


def get_section_tree(book_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute('''
        SELECT id, book_id, parent_id, heading_level, heading_text, content, sort_order
        FROM sections
        WHERE book_id = ?
        ORDER BY sort_order
    ''', (book_id,))
    rows = [dict(row) for row in c.fetchall()]
    conn.close()

    node_map = {}
    roots = []
    for row in rows:
        node = {
            'id': row['id'],
            'book_id': row['book_id'],
            'parent_id': row['parent_id'],
            'heading_level': row['heading_level'],
            'heading_text': row['heading_text'],
            'content': row['content'],
            'sort_order': row['sort_order'],
            'children': []
        }
        node_map[row['id']] = node

    for row in rows:
        node = node_map[row['id']]
        if row['parent_id'] is not None and row['parent_id'] in node_map:
            node_map[row['parent_id']]['children'].append(node)
        else:
            roots.append(node)

    return roots


def get_section(section_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute('''
        SELECT s.id, s.book_id, s.parent_id, s.heading_level, s.heading_text, s.content, s.sort_order,
               b.title as book_title, b.short_name as book_short_name
        FROM sections s
        JOIN books b ON s.book_id = b.id
        WHERE s.id = ?
    ''', (section_id,))
    row = c.fetchone()
    if not row:
        conn.close()
        return None

    section = dict(row)

    c.execute('''
        SELECT id, parent_id, heading_text, heading_level, content, sort_order
        FROM sections
        WHERE book_id = ?
        ORDER BY sort_order
    ''', (section['book_id'],))
    all_rows = [dict(r) for r in c.fetchall()]

    max_level = max(r['heading_level'] for r in all_rows) if all_rows else 0

    section_pattern = re.compile(r'第[一二三四五六七八九十\d]+节')
    section_level_counts = {}
    for r in all_rows:
        if section_pattern.match(r['heading_text']):
            lvl = r['heading_level']
            section_level_counts[lvl] = section_level_counts.get(lvl, 0) + 1

    if section_level_counts:
        page_unit_level = max(section_level_counts, key=section_level_counts.get)
    else:
        page_unit_level = max_level - 1 if max_level > 1 else max_level

    if section['heading_level'] > page_unit_level:
        ancestor_id = None
        current = section
        while current['parent_id'] is not None:
            parent = next((r for r in all_rows if r['id'] == current['parent_id']), None)
            if parent is None:
                break
            if parent['heading_level'] == page_unit_level:
                ancestor_id = parent['id']
                break
            current = parent
        conn.close()
        return {'redirect_to': ancestor_id, 'anchor': section_id}

    children_map = {}
    for r in all_rows:
        pid = r['parent_id']
        if pid not in children_map:
            children_map[pid] = []
        children_map[pid].append(r)

    if section['heading_level'] == page_unit_level:
        children = children_map.get(section_id, [])
        already_merged = False
        if children and section['content']:
            first_child = children[0]
            first_child_id = first_child['id']
            if 'id="section-' + str(first_child_id) + '"' in section['content']:
                already_merged = True
            else:
                heading_prefix = '## ' if first_child['heading_level'] > page_unit_level else '### '
                if (heading_prefix + first_child['heading_text']) in section['content']:
                    already_merged = True

        if not already_merged:
            merged_parts = [section['content'] or '']

            def merge_descendants(node_id):
                sub_children = children_map.get(node_id, [])
                for child in sub_children:
                    level = child['heading_level']
                    heading_prefix = '#' * (level - page_unit_level + 1) if level > page_unit_level else '##'
                    merged_parts.append(
                        '\n\n<span id="section-' + str(child['id']) + '"></span>\n\n'
                        + heading_prefix + ' ' + child['heading_text'] + '\n\n'
                        + (child['content'] or '')
                    )
                    merge_descendants(child['id'])

            merge_descendants(section_id)
            section['content'] = '\n'.join(merged_parts)

        all_merged = []

        def collect_merged(node_id):
            for child in children_map.get(node_id, []):
                all_merged.append({'id': child['id'], 'heading_text': child['heading_text']})
                collect_merged(child['id'])

        collect_merged(section_id)
        section['merged_children'] = all_merged

    navigable_ids = []

    def traverse(node_id):
        node = next((r for r in all_rows if r['id'] == node_id), None)
        if node is None:
            return
        if node['heading_level'] == page_unit_level:
            navigable_ids.append(node_id)
        for child in children_map.get(node_id, []):
            traverse(child['id'])

    root_ids = [r['id'] for r in all_rows if r['parent_id'] is None]
    for root_id in root_ids:
        traverse(root_id)

    try:
        idx = navigable_ids.index(section_id)
    except ValueError:
        idx = -1

    if idx > 0:
        prev_id = navigable_ids[idx - 1]
        c.execute('SELECT heading_text FROM sections WHERE id = ?', (prev_id,))
        prev_row = c.fetchone()
        section['prev_id'] = prev_id
        section['prev_title'] = prev_row['heading_text'] if prev_row else None
    else:
        section['prev_id'] = None
        section['prev_title'] = None

    if idx >= 0 and idx < len(navigable_ids) - 1:
        next_id = navigable_ids[idx + 1]
        c.execute('SELECT heading_text FROM sections WHERE id = ?', (next_id,))
        next_row = c.fetchone()
        section['next_id'] = next_id
        section['next_title'] = next_row['heading_text'] if next_row else None
    else:
        section['next_id'] = None
        section['next_title'] = None

    breadcrumbs = []
    current_parent_id = section['parent_id']
    while current_parent_id is not None:
        c.execute('SELECT id, heading_text, heading_level, parent_id FROM sections WHERE id = ?', (current_parent_id,))
        parent_row = c.fetchone()
        if parent_row:
            breadcrumbs.insert(0, {
                'id': parent_row['id'],
                'heading_text': parent_row['heading_text'],
                'heading_level': parent_row['heading_level']
            })
            current_parent_id = parent_row['parent_id']
        else:
            break

    section['breadcrumbs'] = breadcrumbs

    conn.close()
    return section


def search_sections(query, book_id=None):
    conn = get_connection()
    c = conn.cursor()
    section_pattern = re.compile(r'第[一二三四五六七八九十\d]+节')

    if book_id:
        c.execute('''
            SELECT s.id, s.heading_text, s.heading_level, s.parent_id, s.book_id, s.content, b.title as book_title, b.short_name as book_short_name
            FROM sections s
            JOIN books b ON s.book_id = b.id
            WHERE s.book_id = ? AND (s.heading_text LIKE ? OR s.content LIKE ?)
            ORDER BY s.sort_order
        ''', (book_id, f'%{query}%', f'%{query}%'))
    else:
        c.execute('''
            SELECT s.id, s.heading_text, s.heading_level, s.parent_id, s.book_id, s.content, b.title as book_title, b.short_name as book_short_name
            FROM sections s
            JOIN books b ON s.book_id = b.id
            WHERE s.heading_text LIKE ? OR s.content LIKE ?
            ORDER BY b.sort_order, s.sort_order
        ''', (f'%{query}%', f'%{query}%'))

    rows = c.fetchall()
    results = []

    book_page_unit_levels = {}
    c.execute('SELECT book_id, heading_level, heading_text FROM sections ORDER BY book_id, sort_order')
    all_sections = c.fetchall()
    book_level_counts = {}
    for row in all_sections:
        if section_pattern.match(row['heading_text']):
            bid = row['book_id']
            lvl = row['heading_level']
            if bid not in book_level_counts:
                book_level_counts[bid] = {}
            book_level_counts[bid][lvl] = book_level_counts[bid].get(lvl, 0) + 1
    for bid, counts in book_level_counts.items():
        if counts:
            book_page_unit_levels[bid] = max(counts, key=counts.get)

    for row in rows:
        content = row['content'] or ""
        heading = row['heading_text'] or ""
        
        idx = content.find(query)
        if idx != -1:
            start = max(0, idx - 10)
            end = min(len(content), idx + len(query) + 10)
            snippet = content[start:end]
            if start > 0:
                snippet = "..." + snippet
            if end < len(content):
                snippet = snippet + "..."
        else:
            idx = heading.find(query)
            if idx != -1:
                start = max(0, idx - 10)
                end = min(len(heading), idx + len(query) + 10)
                snippet = heading[start:end]
                if start > 0:
                    snippet = "..." + snippet
                if end < len(heading):
                    snippet = snippet + "..."
            else:
                continue

        res = dict(row)
        res['snippet'] = snippet
        res['page_unit_level'] = book_page_unit_levels.get(row['book_id'], 0)
        del res['content']
        results.append(res)

    conn.close()
    return results


def update_section(section_id, content=None, heading_text=None):
    conn = get_connection()
    c = conn.cursor()

    if content is not None:
        c.execute('UPDATE sections SET content = ? WHERE id = ?', (content, section_id))
    if heading_text is not None:
        c.execute('UPDATE sections SET heading_text = ? WHERE id = ?', (heading_text, section_id))

    conn.commit()
    conn.close()
    return True


def get_study_points(section_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT id, section_id, point_text, detail, sort_order, importance FROM study_points WHERE section_id = ? ORDER BY sort_order', (section_id,))
    points = [dict(row) for row in c.fetchall()]
    conn.close()
    return points


def get_exam_questions(section_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT id, section_id, point_id, question_type, question_text, options, answer, explanation, sort_order FROM exam_questions WHERE section_id = ? ORDER BY sort_order', (section_id,))
    questions = [dict(row) for row in c.fetchall()]
    conn.close()
    return questions


def add_study_point(section_id, point_text, detail='', importance=3):
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM study_points WHERE section_id = ?', (section_id,))
    sort_order = c.fetchone()[0]
    c.execute('INSERT INTO study_points (section_id, point_text, detail, sort_order, importance) VALUES (?, ?, ?, ?, ?)',
              (section_id, point_text, detail, sort_order, importance))
    conn.commit()
    point_id = c.lastrowid
    conn.close()
    return point_id


def update_study_point(point_id, point_text=None, detail=None, importance=None):
    conn = get_connection()
    c = conn.cursor()
    fields = []
    values = []
    if point_text is not None:
        fields.append('point_text = ?')
        values.append(point_text)
    if detail is not None:
        fields.append('detail = ?')
        values.append(detail)
    if importance is not None:
        fields.append('importance = ?')
        values.append(importance)
    if fields:
        values.append(point_id)
        c.execute('UPDATE study_points SET ' + ', '.join(fields) + ' WHERE id = ?', values)
        conn.commit()
    conn.close()
    return True


def delete_study_point(point_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute('DELETE FROM study_points WHERE id = ?', (point_id,))
    conn.commit()
    conn.close()
    return True


def add_exam_question(section_id, question_type, question_text, answer, point_id=None, options=None, explanation=None):
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM exam_questions WHERE section_id = ?', (section_id,))
    sort_order = c.fetchone()[0]
    c.execute('INSERT INTO exam_questions (section_id, point_id, question_type, question_text, options, answer, explanation, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              (section_id, point_id, question_type, question_text, options, answer, explanation, sort_order))
    conn.commit()
    question_id = c.lastrowid
    conn.close()
    return question_id


def update_exam_question(question_id, question_text=None, options=None, answer=None, explanation=None, point_id=None):
    conn = get_connection()
    c = conn.cursor()
    fields = []
    values = []
    if question_text is not None:
        fields.append('question_text = ?')
        values.append(question_text)
    if options is not None:
        fields.append('options = ?')
        values.append(options)
    if answer is not None:
        fields.append('answer = ?')
        values.append(answer)
    if explanation is not None:
        fields.append('explanation = ?')
        values.append(explanation)
    if point_id is not None:
        fields.append('point_id = ?')
        values.append(point_id)
    if fields:
        values.append(question_id)
        c.execute('UPDATE exam_questions SET ' + ', '.join(fields) + ' WHERE id = ?', values)
        conn.commit()
    conn.close()
    return True


def delete_exam_question(question_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute('DELETE FROM exam_questions WHERE id = ?', (question_id,))
    conn.commit()
    conn.close()
    return True


def get_page_unit_section_ids(book_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute('SELECT id, heading_text, heading_level FROM sections WHERE book_id = ? ORDER BY sort_order', (book_id,))
    all_rows = c.fetchall()

    section_pattern = re.compile(r'第[一二三四五六七八九十\d]+节')
    section_level_counts = {}
    for row in all_rows:
        if section_pattern.match(row['heading_text']):
            lvl = row['heading_level']
            section_level_counts[lvl] = section_level_counts.get(lvl, 0) + 1

    if not section_level_counts:
        conn.close()
        return []

    page_unit_level = max(section_level_counts, key=section_level_counts.get)
    section_ids = [row['id'] for row in all_rows if row['heading_level'] == page_unit_level]
    conn.close()
    return section_ids


def mark_section_learning_completed(section_id):
    conn = get_connection()
    c = conn.cursor()
    c.execute('INSERT OR IGNORE INTO section_learning_progress (section_id) VALUES (?)', (section_id,))
    created = c.rowcount > 0
    conn.commit()
    conn.close()
    return created


def reset_book_learning_progress(book_id):
    section_ids = get_page_unit_section_ids(book_id)
    if not section_ids:
        return 0

    conn = get_connection()
    c = conn.cursor()
    placeholders = ','.join('?' for _ in section_ids)
    c.execute('DELETE FROM section_learning_progress WHERE section_id IN (' + placeholders + ')', section_ids)
    deleted = c.rowcount
    conn.commit()
    conn.close()
    return deleted


def get_section_progress(book_id):
    section_ids = get_page_unit_section_ids(book_id)
    total_sections = len(section_ids)
    if total_sections == 0:
        return {'total': 0, 'completed': 0, 'percentage': 0}

    conn = get_connection()
    c = conn.cursor()
    placeholders = ','.join('?' for _ in section_ids)
    c.execute('SELECT COUNT(*) AS cnt FROM section_learning_progress WHERE section_id IN (' + placeholders + ')', section_ids)
    completed_sections = c.fetchone()['cnt']
    conn.close()

    percentage = round(completed_sections / total_sections * 100) if total_sections > 0 else 0
    return {'total': total_sections, 'completed': completed_sections, 'percentage': percentage}


def get_books_progress():
    books = get_all_books()
    for book in books:
        progress = get_section_progress(book['id'])
        book['progress'] = progress
    return books
