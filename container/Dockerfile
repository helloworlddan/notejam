FROM python:2.7.17

RUN ["mkdir", "/app"]

COPY "src/" "/app"

WORKDIR "/app/"

RUN ["pip", "install", "-r", "/app/requirements.txt"]

ENTRYPOINT ["sh", "launch.sh"]