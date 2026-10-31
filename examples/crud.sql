CREATE DATABASE IF NOT EXISTS web_course CHARACTER SET utf8mb4;
USE web_course;
CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  age INT NOT NULL
);
INSERT INTO students (name, age) VALUES ('Иван', 20), ('Мария', 22);
SELECT id, name, age FROM students ORDER BY id;
UPDATE students SET age = 21 WHERE id = 1;
SELECT id, name, age FROM students WHERE id = 1;
DELETE FROM students WHERE id = 2;
SELECT id, name, age FROM students ORDER BY id;