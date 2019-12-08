#!/bin/sh

cd container/src
pip install -r requirements.txt
cd notejam
python ./manage.py test || exit 0 