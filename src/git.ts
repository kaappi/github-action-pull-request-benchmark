import * as github from '@actions/github';
import { Context } from '@actions/github/lib/context';

export { PayloadRepository } from '@actions/github/lib/interfaces';

export interface GitHubUser {
    email?: string;
    name: string;
    username: string;
}

export interface Commit {
    author: GitHubUser;
    committer: GitHubUser;
    distinct?: unknown; // Unused
    id: string;
    message: string;
    timestamp: string;
    tree_id?: unknown; // Unused
    url: string;
}

export type GitHubContext = Context;

export function getLatestPRCommit(githubContext: GitHubContext): Commit {
    const pr = githubContext.payload.pull_request;
    if (!pr) {
        throw new Error(`No commit information is found in payload: ${JSON.stringify(githubContext.payload, null, 2)}`);
    }

    // On pull_request hook, head_commit is not available
    const message: string = pr.title;
    const id: string = pr.head.sha;
    const timestamp: string = pr.head.repo.updated_at;
    const repoUrl = pr.html_url;
    const url = `${repoUrl}/commits/${id}`;
    const name: string = pr.head.user.login;
    const user = {
        name,
        username: name, // XXX: Fallback, not correct
    };

    return {
        author: user,
        committer: user,
        id,
        message,
        timestamp,
        url,
    };
    /* eslint-enable @typescript-eslint/camelcase */
}

export function getBaseCommit(githubContext: GitHubContext): Commit {
    const pr = githubContext.payload.pull_request;
    if (!pr) {
        throw new Error(`No commit information is found in payload: ${JSON.stringify(githubContext.payload, null, 2)}`);
    }

    // On pull_request hook, head_commit is not available
    const message: string = pr.base.label;
    const id: string = pr.base.sha;
    const timestamp: string = pr.base.repo.updated_at;
    const repoUrl = pr.base.repo.html_url;
    const url = `${repoUrl}/commits/${id}`;
    const name: string = pr.base.user.login;
    const user = {
        name,
        username: name, // XXX: Fallback, not correct
    };

    return {
        author: user,
        committer: user,
        id,
        message,
        timestamp,
        url,
    };
    /* eslint-enable @typescript-eslint/camelcase */
}

export function getGitHubContext(): GitHubContext {
    return github.context;
}

export function getCurrentRepo(gitHubContext: GitHubContext) {
    const repo = gitHubContext.payload.repository;
    if (!repo) {
        throw new Error(
            `Repository information is not available in payload: ${JSON.stringify(gitHubContext.payload, null, 2)}`,
        );
    }
    return repo;
}

const COMMENT_MARKER = '<!-- benchmark-pr-comment -->';

export async function publishComment(targetCommit: Commit, body: string, token: string, gitHubContext: GitHubContext) {
    const currentRepo = getCurrentRepo(gitHubContext);
    const api = github.getOctokit(token).rest;
    const owner = currentRepo.owner.login;
    const repo = currentRepo.name;
    const markedBody = `${COMMENT_MARKER}\n${body}`;

    const pr = gitHubContext.payload.pull_request;
    if (pr) {
        const issueNumber = pr.number as number;
        const { data: comments } = await api.issues.listComments({ owner, repo, issue_number: issueNumber });
        const existing = comments.find((c) => c.body?.includes(COMMENT_MARKER));

        let res;
        if (existing) {
            res = await api.issues.updateComment({ owner, repo, comment_id: existing.id, body: markedBody });
            console.log(`Updated existing PR comment #${existing.id}. Response:`, res.status);
        } else {
            res = await api.issues.createComment({ owner, repo, issue_number: issueNumber, body: markedBody });
            console.log(`Created new PR comment. Response:`, res.status);
        }
        return res;
    }

    const res = await api.repos.createCommitComment({
        owner,
        repo,
        commit_sha: targetCommit.id,
        body: markedBody,
    });
    console.log(`Comment was sent to commit ${targetCommit.id}. Response:`, res.status);
    return res;
}

export async function getLatestWorkflowRunAttempt(token: string, gitHubContext: GitHubContext) {
    const workflowRepo = getCurrentRepo(gitHubContext);

    const octokit = github.getOctokit(token);
    const res = await octokit.rest.actions.getWorkflowRun({
        owner: workflowRepo.owner.login,
        repo: workflowRepo.name,
        // eslint-disable-next-line @typescript-eslint/camelcase
        run_id: gitHubContext.runId,
    });

    return res.data.run_attempt;
}
