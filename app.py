from flask import Flask, render_template, jsonify, request, send_from_directory
from utils import (
    get_all_books, get_book, get_book_by_short_name,
    get_section_tree, get_section, search_sections
)
import os

app = Flask(__name__)

IMG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'img')


@app.route('/images/<path:filename>')
def serve_image(filename):
    return send_from_directory(IMG_DIR, filename)


@app.route('/')
def index():
    books = get_all_books()
    return render_template('index.html', books=books)


@app.route('/book/<int:book_id>')
def book_detail(book_id):
    book = get_book(book_id)
    if not book:
        return render_template('404.html'), 404
    tree = get_section_tree(book_id)
    return render_template('book.html', book=book, tree=tree)


@app.route('/book/<short_name>')
def book_by_name(short_name):
    book = get_book_by_short_name(short_name)
    if not book:
        return render_template('404.html'), 404
    tree = get_section_tree(book['id'])
    return render_template('book.html', book=book, tree=tree)


@app.route('/section/<int:section_id>')
def section_detail(section_id):
    section = get_section(section_id)
    if not section:
        return render_template('404.html'), 404
    return render_template('section.html', section=section)


@app.route('/api/books')
def api_books():
    books = get_all_books()
    return jsonify(books)


@app.route('/api/book/<int:book_id>/tree')
def api_book_tree(book_id):
    tree = get_section_tree(book_id)
    return jsonify(tree)


@app.route('/api/section/<int:section_id>')
def api_section(section_id):
    section = get_section(section_id)
    if not section:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(section)


@app.route('/api/search')
def api_search():
    query = request.args.get('q', '').strip()
    book_id = request.args.get('book_id', None)
    if not query:
        return jsonify([])
    if book_id:
        book_id = int(book_id)
    results = search_sections(query, book_id)
    return jsonify(results)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
