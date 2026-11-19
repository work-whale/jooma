# E8 weekly ideas: draft for approval

E8 is the Sunday email to Free teachers ("Your 50 resources are back"). Ash's spec asks for about 40 one-line ideas, one for each teaching week, editable in admin, with the email using the next idea each Sunday. Ash's red note says Claude writes them. This is that list. Nothing is built yet: approve or edit it, then I build it.

## How it reads in the email

> Your free resources are back to 50. That's a deck, a worksheet and a quiz. **This week's idea: a retrieval quiz on last week's topic.**

The button ("Plan this week") opens the idea's tool instead of the dashboard.

## How the weeks work (UK school context)

An English school year has 3 terms, each split in two by a one week "half term" holiday:

| Half term | Roughly | Teaching weeks |
|---|---|---|
| Autumn 1 | early September to late October | 7 |
| Autumn 2 | November to mid December | 7 |
| Spring 1 | early January to mid February | 6 |
| Spring 2 | late February to Easter | 6 |
| Summer 1 | after Easter to late May | 6 |
| Summer 2 | June to late July | 7 |

That is 39 teaching weeks, so 39 ideas, in school year order. My recommendation for "the next idea each Sunday": tie each idea to its week of the school year (counted from the first Sunday in September), rather than a plain rotation, so the Christmas ideas arrive in December and the transition ideas in July. In holiday weeks (half terms, Christmas, Easter, summer) the email uses one of the 4 holiday ideas at the end instead. Dates vary a little by school and by country (Scotland goes back in mid August), so the week ranges in admin would be editable, the same as the list.

Every idea is written to fit Free's 50 resources a week and opens a real tool. No dashes, no "AI", lower case start, no full stop, as the sentence carries on after "This week's idea:".

## Autumn 1 (September to October half term)

| Week | Idea | Opens |
|---|---|---|
| 1 | a "get to know you" lesson for your new class | Lesson Plan |
| 2 | a baseline quiz to see what your class remembers from last year | Quizzes |
| 3 | a letter home introducing yourself and this term's topics | Letters |
| 4 | a worksheet at three levels for your first big topic | Worksheets |
| 5 | a map of this term's topic, ready to share with parents | Topic Map |
| 6 | a reading comprehension linked to your current topic | Comprehension |
| 7 | a 10 question retrieval quiz on everything since September | Quizzes |

## Autumn 2 (November to Christmas)

| Week | Idea | Opens |
|---|---|---|
| 8 | a plan for the rest of this term, week by week | Term Plan |
| 9 | a model paragraph that shows the class what good looks like | Model Texts |
| 10 | five exam style questions to check this half term's learning | Exam Papers |
| 11 | a homework task your class can do in 20 minutes | Homework |
| 12 | a cover lesson ready for the busy weeks before Christmas | Cover Lesson |
| 13 | a festive quiz for the last week of term | Quizzes |
| 14 | a Christmas newsletter for parents | Newsletter |

## Spring 1 (January to February half term)

| Week | Idea | Opens |
|---|---|---|
| 15 | a lesson deck to start your new spring topic | Slides |
| 16 | a retrieval quiz on what was taught before Christmas | Quizzes |
| 17 | a worksheet at three levels for the new topic | Worksheets |
| 18 | SMART targets for pupils who need a push this term | Targets |
| 19 | a short reading comprehension with questions and answers | Comprehension |
| 20 | model answers that show pupils how to reach the top mark | Model Answers |

## Spring 2 (February half term to Easter)

| Week | Idea | Opens |
|---|---|---|
| 21 | a lesson plan for a topic you find tricky to teach | Lesson Plan |
| 22 | an intervention plan for a small group who are behind | Interventions |
| 23 | a World Book Day reading lesson | Lesson Plan |
| 24 | a revision deck for the topic you finished last | Slides |
| 25 | a homework task to keep learning going over Easter | Homework |
| 26 | an Easter quiz for the last week of term | Quizzes |

## Summer 1 (after Easter to May half term)

| Week | Idea | Opens |
|---|---|---|
| 27 | a map of your summer topic | Topic Map |
| 28 | a practice paper for exam season | Exam Papers |
| 29 | report comments written from a few quick notes | Reports |
| 30 | a lesson deck for your summer topic | Slides |
| 31 | a comprehension on a nonfiction text about the topic | Comprehension |
| 32 | a worksheet that mixes this year's topics for revision | Worksheets |

## Summer 2 (June to the end of July)

| Week | Idea | Opens |
|---|---|---|
| 33 | the rest of your end of year reports, from short notes | Reports |
| 34 | a sports day or trip letter for parents | Letters |
| 35 | an end of year quiz on everything your class learned | Quizzes |
| 36 | a pupil profile to hand on to next year's teacher | Pupil Profile |
| 37 | a transition lesson to help your class get ready for next year | Lesson Plan |
| 38 | a summer newsletter for parents | Newsletter |
| 39 | a plan for your first term in September | Term Plan |

## Holiday weeks (half terms, Christmas, Easter, summer)

Kept light, as teachers are off:

| Idea | Opens |
|---|---|
| a lesson deck for your first day back, made in one sentence | Slides |
| a plan for the first week back | Lesson Plan |
| a quiz to welcome the class back and check what they remember | Quizzes |
| a cover lesson to keep ready for a day you might be out | Cover Lesson |

## What I'd build once you approve

1. The list above stored in the existing `lifecycle_ideas` table (kind `e8`) as starting values. That is a small migration, applied to STAGING only, which you push to production with the code.
2. An editor in Admin, Money, Plans results, next to the E10 ideas: change any idea, its tool or its week.
3. E8 picks this week's idea and links to its tool; with no list saved it sends the plain email, as now.
4. Unit tests for the week picking (including holidays and the clocks changing) and the copy rules, and the E8 email test updated.

## Questions for you

1. Happy with the ideas? Change, cut or add any.
2. Tie each idea to its week of the school year (recommended), or a plain rotation where each Sunday takes the next one in the list?
