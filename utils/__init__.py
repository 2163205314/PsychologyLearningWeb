import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'psychology_learning.db')


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
        SELECT id, parent_id, heading_text, heading_level, sort_order
        FROM sections
        WHERE book_id = ?
        ORDER BY sort_order
    ''', (section['book_id'],))
    all_rows = [dict(r) for r in c.fetchall()]

    children_map = {}
    for r in all_rows:
        pid = r['parent_id']
        if pid not in children_map:
            children_map[pid] = []
        children_map[pid].append(r)

    reading_order = []

    def traverse(node_id):
        reading_order.append(node_id)
        for child in children_map.get(node_id, []):
            traverse(child['id'])

    root_ids = [r['id'] for r in all_rows if r['parent_id'] is None]
    for root_id in root_ids:
        traverse(root_id)

    try:
        idx = reading_order.index(section_id)
    except ValueError:
        idx = -1

    if idx > 0:
        prev_id = reading_order[idx - 1]
        c.execute('SELECT heading_text FROM sections WHERE id = ?', (prev_id,))
        prev_row = c.fetchone()
        section['prev_id'] = prev_id
        section['prev_title'] = prev_row['heading_text'] if prev_row else None
    else:
        section['prev_id'] = None
        section['prev_title'] = None

    if idx >= 0 and idx < len(reading_order) - 1:
        next_id = reading_order[idx + 1]
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

    if book_id:
        c.execute('''
            SELECT s.id, s.heading_text, s.heading_level, s.book_id, s.content, b.title as book_title, b.short_name as book_short_name
            FROM sections s
            JOIN books b ON s.book_id = b.id
            WHERE s.book_id = ? AND (s.heading_text LIKE ? OR s.content LIKE ?)
            ORDER BY s.sort_order
        ''', (book_id, f'%{query}%', f'%{query}%'))
    else:
        c.execute('''
            SELECT s.id, s.heading_text, s.heading_level, s.book_id, s.content, b.title as book_title, b.short_name as book_short_name
            FROM sections s
            JOIN books b ON s.book_id = b.id
            WHERE s.heading_text LIKE ? OR s.content LIKE ?
            ORDER BY b.sort_order, s.sort_order
        ''', (f'%{query}%', f'%{query}%'))

    rows = c.fetchall()
    results = []
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
        del res['content']
        results.append(res)

    conn.close()
    return results
