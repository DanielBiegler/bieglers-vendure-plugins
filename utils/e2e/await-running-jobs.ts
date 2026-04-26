import { SimpleGraphQLClient } from '@vendure/testing';
import gql from "graphql-tag";

export const GET_RUNNING_JOBS = gql`
    query GetRunningJobs($options: JobListOptions) {
        jobs(options: $options) {
            items {
                id
                queueName
                state
                isSettled
                duration
            }
            totalItems
        }
    }
`;

const GET_FAILED_JOBS = gql`
    query GetFailedJobs {
        jobs(options: { filter: { state: { eq: "FAILED" } } }) {
            items {
                id
                queueName
                error
            }
            totalItems
        }
    }
`;

/**
 * After awaiting running jobs, call this to assert none failed.
 * Throws with the job error payload so failures are immediately visible in the test output.
 */
export async function assertNoFailedJobs(adminClient: SimpleGraphQLClient): Promise<void> {
    const { jobs } = await adminClient.query(GET_FAILED_JOBS);
    if (jobs.totalItems > 0) {
        const details = jobs.items
            .map((j: any) => `  [${j.queueName}] ${JSON.stringify(j.error)}`)
            .join('\n');
        throw new Error(`${jobs.totalItems} job(s) failed:\n${details}`);
    }
}

/**
 * For mutation which trigger background jobs, this can be used to "pause" the execution of
 * the test until those jobs have completed;
 */
export async function awaitRunningJobs(
    adminClient: SimpleGraphQLClient,
    timeout: number = 5000,
    delay = 100,
) {
    let runningJobs = 0;
    const startTime = +new Date();
    let timedOut = false;
    // Allow a brief period for the jobs to start in the case that
    // e.g. event debouncing is used before triggering the job.
    await new Promise(resolve => setTimeout(resolve, delay));
    do {
        const { jobs } = await adminClient.query(GET_RUNNING_JOBS, {
            options: {
                filter: {
                    isSettled: {
                        eq: false,
                    },
                },
            },
        });
        runningJobs = jobs.totalItems;
        timedOut = timeout < +new Date() - startTime;
    } while (runningJobs > 0 && !timedOut);
}
