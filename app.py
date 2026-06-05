from flask import Flask, render_template, jsonify, request, redirect, url_for, send_from_directory
from utils import (
    get_all_books, get_book, get_book_by_short_name,
    get_section_tree, get_section, search_sections, update_section,
    get_study_points, get_exam_questions, get_section_progress, get_books_progress,
    add_study_point, update_study_point, delete_study_point,
    add_exam_question, update_exam_question, delete_exam_question
)
import os

app = Flask(__name__)

IMG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'img')


@app.route('/images/<path:filename>')
def serve_image(filename):
    return send_from_directory(IMG_DIR, filename)


@app.route('/')
def index():
    books = get_books_progress()
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
    if 'redirect_to' in section:
        kwargs = {'section_id': section['redirect_to'], '_anchor': 'section-' + str(section['anchor'])}
        if request.args.get('highlight'):
            kwargs['highlight'] = request.args.get('highlight')
        return redirect(url_for('section_detail', **kwargs))
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


@app.route('/api/section/<int:section_id>/update', methods=['POST'])
def api_update_section(section_id):
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Invalid request'}), 400

    content = data.get('content')
    heading_text = data.get('heading_text')

    if content is None and heading_text is None:
        return jsonify({'error': 'No fields to update'}), 400

    try:
        update_section(section_id, content=content, heading_text=heading_text)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


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


@app.route('/api/section/<int:section_id>/points')
def api_section_points(section_id):
    points = get_study_points(section_id)
    return jsonify(points)


@app.route('/api/section/<int:section_id>/questions')
def api_section_questions(section_id):
    questions = get_exam_questions(section_id)
    return jsonify(questions)


@app.route('/api/point', methods=['POST'])
def api_add_point():
    data = request.get_json()
    if not data or not data.get('section_id') or not data.get('point_text'):
        return jsonify({'error': 'Missing required fields'}), 400
    try:
        point_id = add_study_point(
            data['section_id'],
            data['point_text'],
            data.get('detail', ''),
            data.get('importance', 3)
        )
        return jsonify({'success': True, 'id': point_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/point/<int:point_id>', methods=['PUT', 'DELETE'])
def api_point(point_id):
    if request.method == 'DELETE':
        try:
            delete_study_point(point_id)
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    elif request.method == 'PUT':
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid request'}), 400
        try:
            update_study_point(
                point_id,
                point_text=data.get('point_text'),
                detail=data.get('detail'),
                importance=data.get('importance')
            )
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500


@app.route('/api/question', methods=['POST'])
def api_add_question():
    data = request.get_json()
    if not data or not data.get('section_id') or not data.get('question_type') or not data.get('question_text') or not data.get('answer'):
        return jsonify({'error': 'Missing required fields'}), 400
    try:
        qid = add_exam_question(
            data['section_id'],
            data['question_type'],
            data['question_text'],
            data['answer'],
            point_id=data.get('point_id'),
            options=data.get('options'),
            explanation=data.get('explanation')
        )
        return jsonify({'success': True, 'id': qid})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/question/<int:question_id>', methods=['PUT', 'DELETE'])
def api_question(question_id):
    if request.method == 'DELETE':
        try:
            delete_exam_question(question_id)
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    elif request.method == 'PUT':
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid request'}), 400
        try:
            update_exam_question(
                question_id,
                question_text=data.get('question_text'),
                options=data.get('options'),
                answer=data.get('answer'),
                explanation=data.get('explanation'),
                point_id=data.get('point_id')
            )
            return jsonify({'success': True})
        except Exception as e:
            return jsonify({'error': str(e)}), 500


@app.route('/api/book/<int:book_id>/progress')
def api_book_progress(book_id):
    progress = get_section_progress(book_id)
    return jsonify(progress)


@app.route('/api/books/progress')
def api_books_progress():
    books = get_books_progress()
    return jsonify(books)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
