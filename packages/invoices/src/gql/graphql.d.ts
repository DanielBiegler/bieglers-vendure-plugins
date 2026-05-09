import type { introspection } from './graphql-env.d.ts';
import { initGraphQLTada } from 'gql.tada';
export declare const graphql: initGraphQLTada<{
    disableMasking: true;
    introspection: introspection;
    scalars: {
        DateTime: string;
        JSON: any;
        Money: number;
    };
}>;
export type { FragmentOf, ResultOf, VariablesOf } from 'gql.tada';
export { readFragment } from 'gql.tada';
