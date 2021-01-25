import * as core from '@actions/core'
import {context, GitHub} from '@actions/github'
import {PullRequest} from '@octokit/graphql-schema'

async function run(): Promise<void> {
  try {
    const GITHUB_TOKEN = core.getInput('githubToken')
    const projectId = core.getInput('projectId')
    const gitHub = new GitHub(GITHUB_TOKEN)
    const pr = context.payload.pull_request
    if (!pr) {
      core.setFailed('This is not a PR')
      return
    }

    const projectIds = Array.from([
      projectId,
      ...(await getExistingProjectIds(gitHub, pr.node_id))
    ])

    const mutation = `
      mutation AddProject($prId: ID!, $projectIds: [ID!]!) {
        updatePullRequest(
          input: {pullRequestId: $prId, projectIds: $projectIds}
        ) {
          clientMutationId
        }
      }
    `

    await gitHub.graphql(mutation, {prId: pr.node_id, projectIds})
  } catch (error) {
    core.setFailed(error.message)
  }
}

async function getExistingProjectIds(
  gitHub: GitHub,
  prId: string
): Promise<Iterable<string>> {
  const pullRequestQuery = `
      query GetProjects($prId: ID!) {
        nodes(ids: [$prId]) {
          ... on PullRequest {
            id
            projectCards {
              nodes {
                project {
                  id
                }
              }
            }
          }
        }
      }
    `
  const result = await gitHub.graphql<{nodes: PullRequest[]}>(
    pullRequestQuery,
    {prId}
  )

  const projects = new Set<string>()

  for (const node of result.nodes) {
    const cards = node.projectCards.nodes
    if (cards == null) break
    for (const card of cards) {
      const existingProjectId = card?.project.id
      if (existingProjectId != null) projects.add(existingProjectId)
    }
  }

  return projects
}

run()
