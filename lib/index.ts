import * as cdk from '@aws-cdk/core';

export interface StepapiProps {
  // Define construct properties here
}

export class Stepapi extends cdk.Construct {

  constructor(scope: cdk.Construct, id: string, props: StepapiProps = {}) {
    super(scope, id);

    // Define construct contents here
  }
}
