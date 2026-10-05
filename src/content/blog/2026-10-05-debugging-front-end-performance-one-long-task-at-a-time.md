---
title: "Debugging front-end performance one long task at a time"
pubDate: 2026-10-05
description: "A task-by-task attribution method for load-time performance, with a React 18 to 19 upgrade as the worked example"
tags: ["performance", "react", "profiling", "ai"]
---

I have spent years making web pages load faster, and most of that work starts the same way. When the main thread is too busy during load, I stop looking at the page's aggregate numbers and look at the individual long tasks: what each one is doing, whose code it is, and whether it exists in both versions of the page. This post describes that method, using a React 18 to 19 upgrade as the worked example.

I have tools that make this easier now, but I did it by hand for years. In 2024, during our React 17 to 18 migration, I wrote an analysis of our pages' load performance built around a hand-made table of long tasks: page initialization, page hydration, navigation hydration, tag manager, and so on, each measured over three loads with the CPU throttled 6x. I also once recorded an 80-minute screencast of myself building one of these tables, hoping others would pick up the method. It mostly showed how tedious the work is, and few people wanted to take it on. That tedium is why I packaged the mechanical parts as a skill for coding agents, which I describe near the end. If you don't have access to the skill, this post should give your coding agent enough to build its own.

Some context on where the method fits. A long task is any main-thread task longer than 50ms, and Total Blocking Time (TBT) adds up the part of each long task beyond 50ms. Our pages render on the server, so their content usually paints before hydration starts. People can read the page and decide what to do while it hydrates, and the goal during hydration is a page that responds when they act, which means short tasks. TBT is a luxury problem in that sense: it becomes the main opportunity once a page already paints its content quickly. After years of load-performance work on these pages, the easier wins are gone. In my 2024 analysis, TBT was the only Lighthouse subscore below 90 on mobile, which is most of our traffic. It also carries the most weight in the Lighthouse score, our field telemetry measures it for real page loads in Chromium browsers, and it's the metric we struggle with most. (On a client-rendered page, holding the main thread to paint sooner can be the better trade.)

We upgraded a high-traffic search results page from React 18 to React 19. The migration was mechanical and the page looked the same, but once it reached real traffic, our field performance telemetry showed the Lighthouse-style score dropping for every combination of device and login state we track. Layout shift accounted for most of the drop, with TBT and Largest Contentful Paint (LCP) making up most of the rest. Our bar for the upgrade was parity with React 18.

The first thing most people do (and the first place an automated tool tends to look) is compare the total blocking time of the old and new versions across a few profiles. We did that, and the numbers were noisy and overlapping. The medians moved, but the ranges were wide enough that we couldn't tell whether a given change had helped.

Instead of asking "what is the page's TBT?" I ask what each long task is doing, whether that task exists in both versions, and, if it does, how its duration changed. The table of tasks is what makes a regression findable.

* * *
## Why aggregate TBT is hard to debug
TBT is a sum, and summing throws away the information needed to debug. Two problems follow.

First, a high-variance component can swamp the signal. This page has a heavy micro-frontend whose hydration sometimes takes a much slower path, so its load times are bimodal. Its run-to-run variation was larger than the regression I was hunting. More loads can characterize the distribution, but the sum still doesn't say which component changed.

Second, the sum can hide a real change even when loads are consistent. If one change removes 40ms from a task and another adds 40ms to a different task, TBT doesn't move. The 50ms threshold distorts things further: shrinking a 70ms task to 45ms removes only 20ms of TBT, and splitting a 120ms task into two 60ms tasks removes 50ms of TBT without removing any work.

A single long task is small enough to understand: which app's code ran, what kind of work it was, which component rendered, and which function did the expensive thing. Once I can name a task, I can look for it in the other build and ask whether it's new, bigger, or unchanged. A task that's new to the long-task table may still exist in the other build as a task under 50ms, which doesn't count toward TBT. That's still a lead: something made it longer.

* * *
## A page can hold several React apps
On our page, each micro-frontend is its own React app with its own root. Other architectures use Module Federation to render remote components inside a single React tree; server-rendering requirements and history led us to separate roots. During the upgrade:

- The page app moved to React 19.
- The search results micro-frontend stayed on React 18 (byte-for-byte identical in both builds).
- The navigation micro-frontend ran React 19 in both.

React itself loads from shared bundles, so each React bundle served more than one app.

Per-task attribution doesn't depend on this architecture. Even with a single React tree, each bundle initializes in its own tasks, and Suspense boundaries separate render work. Stack frames tell me whose code ran: the framework frames come from a shared bundle, and the application frames beneath them show which app's component rendered.
### Kinds of load-time work
When I label a task, I also classify the work, because each kind has a different fix.

- **Module evaluation.** Before hydration, the browser parses, compiles, and runs each bundle: webpack's `__webpack_require__` calls, Module Federation's shared-scope and container initialization, and each module's top-level statements. In a trace this shows up as `EvaluateScript`, webpack runtime frames, or `(program)`.
- **Hydration.** React attaches to the server-rendered HTML. In both React 18 and 19, the part of the tree outside Suspense boundaries hydrates in one pass that doesn't yield (`renderRootSync`, `workLoopSync`). Content inside a Suspense boundary that the server completed hydrates later, at low priority, in short slices that yield to the browser (`workLoopConcurrent`), unless user input or an error makes it urgent. Healthy hydration shows frames like `tryToClaimNextHydratableInstance` and `prepareToHydrateHostInstance`.
- **Hydration mismatch recovery.** When the client render doesn't match the server HTML, React throws away the server DOM for the root or the nearest Suspense boundary and renders that part again on the client. Whether it happens at the root or inside a Suspense boundary, the recovery usually lands as one long synchronous task; in our React 19 traces, one Suspense boundary's recovery committed as a single task of several hundred milliseconds. Look for `recoverFromConcurrentError`, `retrySuspenseComponentWithoutHydrating`, or `clearSuspenseBoundary`, followed by DOM insertion and `setProp` work. This is usually the first thing I look for. In my experience it's common, and it throws away work the server already did.
- **Commit.** React applies changes to the DOM (`commitRoot`, `commitMutationEffectsOnFiber`, `setProp`) and runs layout effects, including every `useLayoutEffect`. Commit never yields in either version. In our traces of the page app's hydration, commit took more time than render.
- **Post-hydration synchronous update.** A re-render right after hydration because some state changed on mount (`performSyncWorkOnRoot`; in React 19, often flushed across several roots at once by `flushSyncWorkAcrossRoots_impl`). A common cause is a component that has to match the server HTML on its first render and then adjust for browser state:

  ```tsx
  const [isFirstRender, setFirstRender] = useState(true);
  useEffect(() => setFirstRender(false), []);
  ```
- **Forced reflow.** Synchronous layout caused by reading geometry (`getBoundingClientRect`, `innerHeight`, `offsetWidth`) after the DOM changed, often inside a layout effect during commit. The DevTools Performance panel flags these in its forced reflow insight.

Mismatch recovery, post-hydration updates, and forced reflows are usually work the page doesn't need to do, so I look for them first, starting with mismatch recovery. I cover fixes for each kind after the workflow.

* * *
## Workflow
```
1. SCOPE          Pick the metric and one page/device/login combination.
        |         Field data if you have it; a lab comparison of a change works too.
        v
2. A/B            Two builds that differ by one change, on the same base commit.
        |         Real device emulation and user-agent. CPU throttled. 3+ loads each.
        v
3. CAPTURE        Save a reload trace per load, plus source maps for each build.
        |
        v
4. ATTRIBUTE      For each long task: which app, which kind of work, and which part of
        |         its call tree takes most of the time. Give it a plain-language label.
        v
5. COMPARE        One table with columns for each build. Long tasks found in only one
        |         build go first, then tasks in both builds whose duration changed.
        v
6. FIX + VERIFY   Change one thing. Recapture. Check that the specific task shrank
                  and that its work didn't move to another task.
```
### 1. Choose what to measure
Field telemetry is the best starting point when you have it. It shows which combination of page type, device, and login state got worse, and I pick the worst high-traffic one. We narrowed to mobile search results, logged out, and scoped everything after that to it. Field data isn't a prerequisite, though. I can compare two builds in the lab before a change ships, and when the lab aggregate is noisy, the task table is what separates the change from the noise.

It also helps to know what each metric can tell me. On this server-rendered page, First Contentful Paint mostly reflected server time. LCP should come from the server-rendered HTML, so a later client-side paint of the LCP element is a clue. TBT is the metric I break down into tasks. Layout shift entries name the nodes that moved, and a shift usually follows the task that caused it, so I line up shift timestamps with the task table.

In this upgrade, LCP, TBT, and layout shift all got worse together, which made me suspect a hydration mismatch that removed and re-rendered the region containing the LCP element. That was close. The region wasn't removed: React 19's streaming server rendering had sent its content out of order, so the region stayed empty until a script moved the content into place after first paint. I describe it with the fixes below.
### 2. Compare builds that differ by one change
I set up two preview environments whose branches differ by one change, here the React version.

Our first comparison cut the two branches from different base commits, so it carried 94 commits and about 150 changed files of unrelated drift. The mechanisms we found survived, but every magnitude was suspect, and we lost a day trusting numbers we shouldn't have. Rebasing both branches onto the same base commit is what made the deltas trustworthy. Merge-result pipelines add a subtler version of the same problem: each preview build merges its branch with the target branch as it is at build time, so builds made at different times can differ by more than their branches. Sometimes we judged that difference small enough to ignore. I keep a table of what each build contains (framework version, dependency versions, branch, base commit, environment) and check that the builds really differ by one change.

A related trap is hydrating with a development build to get readable names. Our shared-dependency loader can switch the browser to development builds with a localStorage override while the server keeps rendering with production builds. Emotion, our CSS-in-JS library, generates different class names in development and production, so every micro-frontend reports hydration mismatches that don't exist in production, and they pollute the trace. I profile production builds and recover names from source maps.
### 3. Capture consistently
- Emulate the real device, including the user-agent. Many sites serve a different page to a mobile user-agent, and shrinking the viewport isn't enough. Before tracing, confirm you're on the page you think you are (check a body class or an item count).
- Throttle the CPU (I use 6x). Throttling separates long tasks cleanly and gives the sampler more resolution, so I compare the profiles to each other and don't treat the absolute numbers as production numbers. In 2024 I found that 6x showed as much as 20x, with less noise.
- Take at least three loads per build, because one load can't show how much loads vary. Keep the cache state the same for every load in both builds. Our capture script clears the cache before each load, which makes download and compile time match a first visit, but for debugging long tasks the consistency is what counts. I name traces so the build, page, throttle, and load number are all in the filename.
- Pull the source maps for the app bundles once per build, because they change with the build hash.
### 4. Attribute each task
This is the tedious part. By hand, I open each trace in the DevTools Performance panel, click through the long tasks, and read each one's call tree until I can tell whose code it is and which subtree takes most of its time: for example, that a task is mostly hydration mismatch recovery, and how long the recovery took. I give each task a plain-language label: page initialization, navigation initialization, page hydration, navigation hydration, search results commit. Then I write each duration into a table in a document, with a column per load, roughly in the order the tasks ran. My 2024 analysis was built that way.

A script can do most of this. For each task of 50ms or more, it records the app that owns the work, the kind of work (from the list above), the component that rendered (the app frame under `renderWithHooks`, source-mapped to a file and line), and the frame with the most self-time, with its file and line. I didn't track that last one by hand, but it helps when the problem lives in one function. The telemetry reflow I describe below was a single function with 31 to 36ms of self-time inside a longer task, which is easy to miss when you're reading subtree totals. The skill I describe below includes such a script. I still add the plain-language label, and it's the column people read first.

Most app bundles ship source maps, so their frames resolve to files and lines. React is harder. React 18's `react-dom.production.min.js` ships already minified with no source map, so its frames have names like `Tk` and `il`. I identify those by content: I find the minified function in the served file and match its structure to React's source. For example, a function that walks sibling DOM nodes, removing everything between the `<!--$-->` and `<!--/$-->` comment markers, is `clearSuspenseBoundary`. Once I've identified a function, I reuse the mapping for that build and check it again on the next one, because the minified names change with each build. React 19's package ships an unminified production build, so your bundler's source map recovers many of the names, and I identify the rest the same way.

If you write a script to parse traces, or use someone else's, check it against DevTools before trusting it: compare the long-task count and TBT for the same trace. A nearly empty table on a visibly busy page means the script picked the wrong thread or dropped samples. That check caught a bug in our analyzer, which had matched CPU profiles to threads by process ID alone and quietly read the wrong thread.

Knuth's "Beware of bugs in the above code; I have only proved it correct, not tried it" applies to performance reasoning too, so I confirm conclusions against the frames in both builds' traces. Twice in this investigation, the coding agent I worked with reached a conclusion the traces didn't support. It saw `renderRootSync` in a React 19 trace and concluded that React 19 had made initial hydration synchronous. The React 18 traces had the same frames: in both versions, the tree outside Suspense boundaries hydrates synchronously, and only Suspense content can be time-sliced. Later, a script that kept only tasks over 40ms "showed" that React 18 never time-sliced anything on the page, because every slice was shorter than 40ms. I had seen the slices myself, and the unfiltered trace had them.
### 5. Build the comparison table
I put both builds in one table, with a row per task and a column per load in each build, so a task that exists in only one build stands out as a row with blanks on one side. Here is a simplified excerpt from our mobile traces (6x CPU throttling, three loads per build):

```
task                                kind                     React 18 (ms)     React 19 (ms)
page app post-hydration update      post-hydration update      -    -    -     335  290  291
search results hydration + commit   hydration and commit     811  772  736     814  761  849
```

The real table has a row for every task of 50ms or more, around 40 per load, plus columns for the owning app, the component, and the frame with the most self-time.

Long tasks found in only one build go first. The page app's task was one: every React 19 load had one or two page-app long tasks, and no React 18 load had any. The code behind it ran on React 18 too, but there it never formed a long task of its own. Treat a row like that as a lead to check, because minified names or ownership labels can change between builds and make one task look like two. This one held up under source maps and trace inspection. It was more useful than the TBT median because it named work I could investigate. The search results task was the biggest on the page, but it was about the same in both builds, so it wasn't the regression.

I keep every long task from both builds in the table, including the ones that don't line up, because the task I'm looking for is often one that doesn't. I also include a total count, so anyone reading the table can see that no rows were left out.

#### Attribute work to the app that caused it
Our first pass labeled each task by the bundle with the most self-time. That works for app bundles and fails for shared ones. On React 18, the page app and the search results micro-frontend used the same React bundle, so "React 18 bundle time" didn't say whose render it was, and an early comparison of React 18 bundle time against React 19 bundle time compared different apps' work. We retracted it.

The fix is to attribute at the app level. I follow the stack below the framework frames to the application code that caused the work (the component under `renderWithHooks`, or the app code that scheduled the update) and label the task by that app. The same rule handles a task that contains work for several apps, which happens when React flushes updates to several roots in one event-loop turn. I split that task's time by app instead of assigning all of it to whichever app looks biggest.
### 6. Fix one thing, then check the task
I change one thing, redeploy, recapture with the same recipe, and check the specific task. For the telemetry fix below, the function that forced a reflow went from 31 to 36ms of self-time per trace to none in any of the three desktop traces of the fixed build. A slightly lower TBT wouldn't have told me whether that fix did anything.

Two things I watch for. The first is cost relocation: removing one forced reflow can hand the layout to the next geometry read, so I check that the whole task shrank. The second is what's left. Most fixes shrink a task instead of deleting it, so I report the remaining cost. After the three page-app fixes below, the page app's framework time in our lab traces matched React 18. If a field experiment bundles several fixes, I report the effect of the bundle and don't assign the gain to any one fix without a separate arm.

To show production impact, I need field data. An A/B test with a randomly assigned treatment group is the strongest evidence when it's feasible and worth the cost. Without one, I need a clean time boundary, fresh data, and stable traffic composition. A healthy deployment shows the release didn't break anything; whether it made the page faster is a separate question with separate evidence.

* * *
## Fixes from this upgrade
**A client-only state flip at the root re-rendered the whole page.** The page's root component used a hook built from a `useState`/`useEffect` pair that returns false during hydration and true after mount, so it could render two client-only widgets in the browser only. Because that state lived in the root, flipping it re-rendered the whole page synchronously right after hydration. We moved the hook into the two widgets that needed it, each wrapped in its own client-only Suspense boundary, so the flip re-renders only them. In our 6x-throttled mobile traces, the page app's framework self-time dropped from about 50ms to about 5ms.

**Telemetry that forced a synchronous reflow.** A logging call computed orientation as `innerHeight > innerWidth`. Reading document layout right after commit forced a reflow in these traces. The fix was to read screen state (`screen.orientation.type`, `screen.width/height`) instead of document layout. The function disappeared from the fixed build's task tables.

**A geometry read inside a layout effect.** A `getBoundingClientRect` call ran inside a layout effect during commit, forcing layout in the middle of the commit. For most geometry reads, the better fix is to get the value from an observer. `IntersectionObserver` entries include `boundingClientRect` and `rootBounds`, computed without forcing layout, and `ResizeObserver` reports size changes. This code also needed `window.scrollY`, which neither observer reports, so a full rewrite would have been a larger change with its own risk. When you can't get what you need from an observer entry, defer the `getBoundingClientRect` call into a `requestAnimationFrame` callback, off the commit. We moved it into an existing throttled `requestAnimationFrame` callback. In the fixed traces, the read moved out of the commit task, and that task shrank.

The three page-app fixes weren't React 19 bugs. They were avoidable main-thread work that already existed. The upgrade changed how some of that work was scheduled and how DOM writes appeared in the profile, which made the debt visible as distinct long tasks. Cleaning up hydration mismatches and post-hydration re-renders before a major framework upgrade reduces both the existing cost and the number of surprises the upgrade can expose.

**React 19's streaming server rendering revealed content after first paint.** One finding did come from React 19. Our React 19 server output streamed the content of completed Suspense boundaries out of order. Where each boundary's content belonged, the HTML had an empty placeholder, and the content itself came later in the document inside a hidden element. An inline script (`$RC`) moved each piece of content into place after first paint. React 18 had emitted the same boundaries in place. Moving the content showed up as a large `removeChild`-dominated task that only the React 19 build had. The LCP element was inside that content, so it couldn't paint until the move, which delayed LCP, and everything below the revealed content shifted. Setting a very large `progressiveChunkSize` on every `renderToPipeableStream` call kept the boundaries in place. In lab traces, the reveal task and the layout shift disappeared, and LCP render delay returned to React 18 levels.

That task is the clearest example of why tasks found in only one build go first. Our analyzer missed it at first, for two reasons: the thread-selection bug above made the table nearly empty, and we were comparing matched tasks before unmatched ones.

### Fixes by kind of work
- **Module evaluation.** Split or defer bundles, move work out of module scope, and yield to the event loop between initializations. Our Module Federation shared dependencies load like dynamic imports, through webpack's async chunk-loading path. We patch webpack to yield between module initializations on that path whenever at least 5ms have passed since the last yield, and a related patch makes barrel-file imports use shared dependency names so they go through the same path. This mainly helps server-rendered pages, and Module Federation is more often used for client-rendered apps, so I haven't proposed it upstream.
- **Hydration.** Put content inside Suspense boundaries so its hydration can yield. The tree outside any boundary hydrates in one pass in both React 18 and 19. I remembered seeing hydration sliced into 5ms chunks; the slices were real, but they belonged to other apps' Suspense content, and the page app's hydration ran as one pass in both versions.
- **Hydration mismatch recovery.** Make the first client render produce the same HTML as the server, and move browser-only differences to after hydration.
- **Commit.** Hydration and commit get cheaper when there's less to render and less DOM to change. Keep layout effects small, because they run inside the commit.
- **Post-hydration synchronous update.** Move the state into the components whose rendering depends on it, as in the first fix above, or wrap the state change in `startTransition` so React can render the update in slices that yield.
- **Forced reflow.** Read values that don't depend on layout, get geometry from observer entries, or defer the read to `requestAnimationFrame`, as in the second and third fixes above.

* * *
## Notes from the investigation
- **A clean console doesn't prove there were no errors.** Pages often catch errors and send them to a logging endpoint instead of the console. Recoverable React hydration errors (`onRecoverableError`) were in that category for us. To count them, I patch `sendBeacon`, `fetch`, and XHR in an init script and decode the beacons, which can be batched. Before trusting a clean console for any class of error, find out how the page reports it.
- **Chrome DevTools and React DevTools answer different questions.** The Chrome Performance panel shows every task on the main thread with its JavaScript stacks, including layout and code that isn't React, and a source-mapped stack is enough to name the component under `renderWithHooks`. The React DevTools Profiler shows how long each component took to render in each commit and, if enabled, why it rendered, but it doesn't show tasks, layout, or other apps' work, and in production it needs a profiling build. I use Chrome to find what blocked the main thread and React DevTools to find why a component rendered.
- **Small n is fine to explore, but not to conclude.** Much of this runs at n of 1 to 3, which is enough to find leads. In this investigation, a per-task difference at n of 6 remained a hypothesis. We thought we saw the search results micro-frontend doing more commit work when the page app ran React 19, wrote it up as an open problem, and then watched it wash out as we collected more loads. It was bimodal noise. The task-level view that surfaces a real regression can also dissolve a fake one, but only if I keep sampling instead of stopping at the first suggestive table.

* * *
## Making the method easier to use
Profiling at this level isn't a common skill. It's hard to learn, and doing it well by hand is tedious enough that few people stick with it. When a regression shows up, most of us look at the aggregate score, and the aggregate can't say which task changed.

Much of the tedious part can be automated now. A trace analyzer can group CPU profile samples into the main thread's tasks, resolve source maps, and build the comparison table. A coding agent with browser automation and a shell can capture consistent traces, fetch source maps, and help identify minified frames. I packaged that as a skill for coding agents, with the analyzer and capture scripts. A person still chooses what to measure, makes sure the two builds differ by one change, rejects implausible output, and decides which fix is worth making.

My hope is that the skill lowers the barrier enough that more people can do this work and get good at it. I learned the method with DevTools because that was the best tool I had. Someone who learns it with an agent skill has learned the same method.

* * *
## Conclusion
Performance work comes down to finding the slow parts and fixing them, and during page load, per-task attribution is how I find them: list the long tasks, label what each one is doing, compare the builds task by task, and look first at long tasks that exist in only one build. In this upgrade, the task tables pointed to four causes behind a noisy drop in the score: three pieces of avoidable work that React 19 made more visible, and one change in React 19's streaming server rendering. We checked each fix against the specific task it targeted, then watched the aggregate score to see whether the page improved.

If you want to try the method, give this post to a coding agent and ask it to build the capture, analysis, and comparison steps.
