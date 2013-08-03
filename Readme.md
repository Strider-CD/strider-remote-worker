
# Queen

A queen runs the server, performs load ballancing, etc. When a worker
connects to the server, a Drone object is created.

# Drone

A drone takes jobs. The connected worker is queried as to its capacity
and speed with a "query-info" event.

# Data that you get with "start job"

## Current (from strider/lib/jobs.js)
```
- user_id
- github_apikey
- job_id
- repo_config (unsanitized)
- deploy_config
- deploy_target
- repo_ssh_url
- job_type
- github_commit_info
```
## What I'd like to see
```
- user_id
- repo: {
    url: github.com/jaredly/jared.git
    auth: {
      type: https
      username:
      password:
    } || {
      type: ssh
      key:
    }
    provider: github || bitbucket || gitlab
    vcs: git || hg
  }
- job_id
- ref: {
    branch:
    id:
  } || {
    fetch: "+refs/pull/141/merge"
  }
- job_type (TEST, DEPLOY, TEST&DEPLOY)
- // trigger (manual or commit .. or something else? pull request?)

// stuff gotten from the DB & config file
- plugins: [names, in, order]
- config {
    .. defined by the plugins ..
  }
```

# Events the drone will fire on the io

## browser

When a job event is fired from the remote worker, the drone will fire
a `browser` event with the arguments `eventtype, [args]`.

## job:info

Fired in response to a `job:query-info (reqid, jobid)` event. Args: `reqid,
jobid, jobinfo`. This will mostly be initiated by a browser who
receives an update for an unknown job.
  
# Messages that can be passed to a drone (using SockEmitter)

- drone:info (in response to a drone:query-info)

## command specific

- job:cmd:start  id, num, command, screencmd [sanitized version of command]
- job:cmd:done   id, num, code
- job:cmd:stdout id, num, text
- job:cmd:stderr id, num, text

## plugin specific

- job:plugin     id, plugin, ANY*

## general

Will this be needed? How would we display them? we could just throw
them in wherever. They would be output as part of whatever command is
currently being run.

- job:stdout     id, text
- job:stderr     id, text

## status

- job:queued     id, timestamp
- job:started    id, timestamp
- job:tested     id, code, timestamp
- job:deployed   id, code, timestamp
- job:done       id, timestamp

# Thoughts

Currently all drones are expected to have all plugins. Is that an
issue?