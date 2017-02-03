
# Strider Network Worker

[![Greenkeeper badge](https://badges.greenkeeper.io/Strider-CD/strider-remote-worker.svg)](https://greenkeeper.io/)
To some extent, this document contains my thoughts about all workers,
and indeed strider's handling of jobs generally. I'll extract that out
later.

## Queen

A queen runs the server, performs load ballancing, etc. When a worker
connects to the server, a Drone object is created.

## Drone

A drone takes jobs. The connected worker is queried as to its capacity
and speed with a "query-info" event.

## Data that you get with "start job"

### Current (from strider/lib/jobs.js)
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
### What I'd like to see
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
- trigger [see trigger spec below]

// stuff gotten from the DB & config file. Any branch-specific config
// is already factored in.
- plugins: [names, in, order]
- config {
    .. defined by the plugins ..
  }
```

#### Trigger spec

```
{
  type:
  author: {
    id: <strider uid>
    url: <ex: github.com/username>
    name: "Jared Forsyth"
    email: [optional]
    gravatar: [suggested]
    username: [only applicable for github, etc.]
  }
  message: [displayed in the ui]
  timestamp: [required]
  url: [message links here]
  source: {
    type: UI
    page: dashboard
  } || {
    type: API
    app: [app id? app name?]
  } || {
    type: plugin
    plugin: name
  }
}
```

The only trigger provided by default is "manual".

Ideas for other triggers:
- commit [by the github plugin]
- pull-request [by the github plugin]
- dependency [dependency-checker]
```

## Events

### Events the queen listens for

```
- queue:new   {job data}
```
The queen then decides which drone should handle the request. This is
the one that's fastest and has open capacity. If all are full, then
just the one with the shortest queue (relative to its capacity).

### Events the drone listens for

```
- job:query-info  jobid
```
This will generally get fired by the `api/jobs` endpoint if there are
jobs in progress. That way the user will be able to see the full
output of a running job when they get to the page, not just the output
since they showed up.

### Events the drone will fire

```
- browser   eventtype, [args]   // proxying job:* events from the remote
- job:info  jobid, job-data     // in response to job:query-id
```

### Events the drone will fire to the remote

```
- drone:query-info
- queue:new         {job data}
```
  
### Events the remote fires to the drone

```
- drone:info     {speed: int, capacity: int} // maybe report plugins as well? See thoughts @ bottom
```

#### command specific

```
- job:cmd:start  id, num, command, screencmd [sanitized version of command]
- job:cmd:done   id, num, exitCode
- job:cmd:stdout id, num, text
- job:cmd:stderr id, num, text
```

#### plugin specific

Currently these are only sent up to the browser. They aren't
propagated by the drone on the main strider server. Do we want this?

```
- job:plugin     id, plugin, [whatever the plugin passes in]
```

#### general

They would be output as part of whatever command is currently being
run.

```
- job:stdout     id, text
- job:stderr     id, text
```

#### status

```
- job:queued     id, timestamp
- job:started    id, timestamp
- job:tested     id, code, timestamp
- job:deployed   id, code, timestamp
- job:done       id, timestamp
```

# Thoughts

Currently all drones are expected to have all plugins. Is that an
issue? Drones could of course send in `drone:info` which plugins are
installed, and the queen would then only send it jobs it could
handle. But is there a real use case for that?
