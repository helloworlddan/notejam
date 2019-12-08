#!/bin/sh

cd /app/notejam
python ./manage.py runserver 0.0.0.0:"${PORT}"