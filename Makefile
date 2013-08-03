
test: lint
	@./node_modules/.bin/mocha -R spec

lint:
	@./node_modules/.bin/jshint --verbose *.js */*.js

.PHONY: test lint
