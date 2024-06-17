const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const {format, isValid, parseISO} = require('date-fns')

const app = express()
app.use(express.json())

const path = require('path')

const dbPath = path.join(__dirname, 'todoApplication.db')
let db = null

// Initialize database and server
const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running on http://localhost:3000/')
    })
  } catch (e) {
    console.error(`DB Error: ${e.message}`)
  }
}
initializeDbAndServer()

// Helper function to validate date format
const validateDate = dateString => {
  const date = parseISO(dateString)
  return isValid(date)
}

// Get all todos with optional filtering by status, priority, category, and search query
app.get('/todos/', async (request, response) => {
  try {
    const {
      status = '',
      priority = '',
      search_q = '',
      category = '',
    } = request.query

    const priorityValues = ['HIGH', 'MEDIUM', 'LOW']
    const statusValues = ['TO DO', 'IN PROGRESS', 'DONE']
    const categoryValues = ['WORK', 'HOME', 'LEARNING']

    if (priority && !priorityValues.includes(priority)) {
      return response.status(400).send('Invalid Todo Priority')
    }
    if (status && !statusValues.includes(status)) {
      return response.status(400).send('Invalid Todo Status')
    }
    if (category && !categoryValues.includes(category)) {
      return response.status(400).send('Invalid Todo Category')
    }

    const query = `
      SELECT id, todo, priority, status, category, due_date AS dueDate
      FROM todo 
      WHERE status LIKE '%${status}%' AND priority LIKE '%${priority}%'
      AND todo LIKE '%${search_q}%' AND category LIKE '%${category}%';
    `

    const todos = await db.all(query)
    response.send(todos)
  } catch (e) {
    console.error(e.message)
    response.status(500).send('Server Error')
  }
})

// Get a specific todo by ID
app.get('/todos/:todoId/', async (request, response) => {
  const {todoId} = request.params
  try {
    const query = `
      SELECT id, todo, priority, status, category, due_date AS dueDate
      FROM todo
      WHERE id = ${todoId};
    `
    const todo = await db.get(query)
    if (todo) {
      response.send(todo)
    } else {
      response.status(404).send('Todo Not Found')
    }
  } catch (e) {
    console.error(e.message)
    response.status(500).send('Server Error')
  }
})

// Get todos by a specific due date
app.get('/agenda/', async (request, response) => {
  const {date} = request.query
  if (!validateDate(date)) {
    return response.status(400).send('Invalid Due Date')
  }
  const dueDate = format(new Date(date), 'yyyy-MM-dd')
  try {
    const query = `
      SELECT id, todo, priority, status, category, due_date AS dueDate
      FROM todo
      WHERE due_date = '${dueDate}';
    `
    const todos = await db.all(query)
    return response.send(todos)
  } catch (e) {
    console.error(e.message)
    response.status(500).send('Server Error')
  }
})


// Create a new todo
app.post('/todos/', async (request, response) => {
  const {id, todo, priority, category, status, dueDate} = request.body

  const priorityValues = ['HIGH', 'MEDIUM', 'LOW']
  const statusValues = ['TO DO', 'IN PROGRESS', 'DONE']
  const categoryValues = ['WORK', 'HOME', 'LEARNING']

  if (!priorityValues.includes(priority)) {
    return response.status(400).send('Invalid Todo Priority')
  }
  if (!statusValues.includes(status)) {
    return response.status(400).send('Invalid Todo Status')
  }
  if (!categoryValues.includes(category)) {
    return response.status(400).send('Invalid Todo Category')
  }
  if (!validateDate(dueDate)) {
    return response.status(400).send('Invalid Due Date')
  }

  const formattedDueDate = format(new Date(dueDate), 'yyyy-MM-dd')
  try {
    const query = `
      INSERT INTO todo (id, todo, priority, status, category, due_date)
      VALUES (${id}, '${todo}', '${priority}', '${status}', '${category}', '${formattedDueDate}');
    `
    await db.run(query)
    return response.send('Todo Successfully Added')
  } catch (e) {
    console.error(e.message)
    response.status(500).send('Server Error')
  }
})

// Update a todo by ID
app.put('/todos/:todoId/', async (request, response) => {
  const {todoId} = request.params
  try {
    const existingTodoQuery = `SELECT * FROM todo WHERE id = ${todoId}`
    const existingTodo = await db.get(existingTodoQuery)
    if (!existingTodo) {
      return response.status(404).send('Todo Not Found')
    }

    const {status, priority, todo, category, dueDate} = request.body

    const priorityValues = ['HIGH', 'MEDIUM', 'LOW']
    const statusValues = ['TO DO', 'IN PROGRESS', 'DONE']
    const categoryValues = ['WORK', 'HOME', 'LEARNING']

    if (priority && !priorityValues.includes(priority)) {
      return response.status(400).send('Invalid Todo Priority')
    }
    if (status && !statusValues.includes(status)) {
      return response.status(400).send('Invalid Todo Status')
    }
    if (category && !categoryValues.includes(category)) {
      return response.status(400).send('Invalid Todo Category')
    }
    if (dueDate && !validateDate(dueDate)) {
      return response.status(400).send('Invalid Due Date')
    }

    const updates = {}
    if (status && status !== existingTodo.status) updates.status = status
    if (priority && priority !== existingTodo.priority)
      updates.priority = priority
    if (todo && todo !== existingTodo.todo) updates.todo = todo
    if (category && category !== existingTodo.category)
      updates.category = category
    if (
      dueDate &&
      format(new Date(dueDate), 'yyyy-MM-dd') !== existingTodo.due_date
    ) {
      const formattedDueDate = format(new Date(dueDate), 'yyyy-MM-dd')
      updates.due_date = formattedDueDate
    }

    const updateFields = Object.keys(updates)
      .map(key => `${key} = '${updates[key]}'`)
      .join(', ')

    if (updateFields.length > 0) {
      const updateQuery = `
        UPDATE todo
        SET ${updateFields}
        WHERE id = ${todoId};
      `
      await db.run(updateQuery)

      if (status && status !== existingTodo.status)
        return response.send('Status Updated')
      if (priority && priority !== existingTodo.priority)
        return response.send('Priority Updated')
      if (todo && todo !== existingTodo.todo)
        return response.send('Todo Updated')
      if (category && category !== existingTodo.category)
        return response.send('Category Updated')
      if (
        dueDate &&
        format(new Date(dueDate), 'yyyy-MM-dd') !== existingTodo.due_date
      )
        return response.send('Due Date Updated')
    } else {
      response.send('No Updates Provided')
    }
  } catch (e) {
    console.error(e.message)
    response.status(500).send('Server Error')
  }
})

// Delete a todo by ID
app.delete('/todos/:todoId/', async (request, response) => {
  const {todoId} = request.params
  try {
    const deleteQuery = `
      DELETE FROM todo
      WHERE id = ${todoId};
    `
    await db.run(deleteQuery)
    response.send('Todo Deleted')
  } catch (e) {
    console.error(e.message)
    response.status(500).send('Server Error')
  }
})

module.exports = app;
