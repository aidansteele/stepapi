import * as iam from '@aws-cdk/aws-iam';
import * as sfn from '@aws-cdk/aws-stepfunctions';
import { Construct } from 'constructs';
import { RestApi, RestApiProps } from '@aws-cdk/aws-apigateway';
import { StepFunctionsIntegration } from './integration';
import { Model } from '@aws-cdk/aws-apigateway';

/**
 * StepFunctionsRestApiProps
 */
export interface StepFunctionsRestApiProps extends RestApiProps {
/**
 * The default State Machine that handles all requests from this API.
 *
 * This handler will be used as a the default integration for all methods in
 * this API, unless specified otherwise in `addMethod`.
 */
  readonly handler: sfn.IStateMachine;

  /**
  * If true, route all requests to the State Machine
  *
  * If set to false, you will need to explicitly define the API model using
  * `addResource` and `addMethod` (or `addProxy`).
  *
  * @default true
  */
  readonly proxy?: boolean;

  /**
  * Rest API props options
  * @default - no options.
  *
  */
  readonly options?: RestApiProps;
}

/**
 * Defines an API Gateway REST API with a Synchrounous Express State Machine as a proxy integration.
 *
 */

export class StepFunctionsRestApi extends RestApi {
  constructor(scope: Construct, id: string, props: StepFunctionsRestApiProps) {
    if ((props.options && props.options.defaultIntegration) || props.defaultIntegration) {
      throw new Error('Cannot specify "defaultIntegration" since Step Functions integration is automatically defined');
    }

    const apiRole = getRole(scope, props);
    const methodResp = getMethodResponse();

    let corsEnabled;

    if (props.defaultCorsPreflightOptions !== undefined) {
      corsEnabled = true;
    } else {
      corsEnabled = false;
    }

    super(scope, id, {
      defaultIntegration: new StepFunctionsIntegration(props.handler, {
        credentialsRole: apiRole,
        proxy: false, //proxy not avaialble for Step Functions yet
        corsEnabled: corsEnabled,
      }),
      ...props.options,
      ...props,
    });

    this.root.addMethod('ANY', new StepFunctionsIntegration(props.handler, {
      credentialsRole: apiRole,
    }), {
      methodResponses: [
        ...methodResp,
      ],
    });
  }
}

function getRole(scope: Construct, props: StepFunctionsRestApiProps): iam.Role {
  const apiName: string = props.handler + '-apiRole';
  const apiRole = new iam.Role(scope, apiName, {
    assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
  });

  apiRole.attachInlinePolicy(
    new iam.Policy(scope, 'AllowStartSyncExecution', {
      statements: [
        new iam.PolicyStatement({
          actions: ['states:StartSyncExecution'],
          effect: iam.Effect.ALLOW,
          resources: [props.handler.stateMachineArn],
        }),
      ],
    }),
  );

  return apiRole;
}

function getMethodResponse() {
  const methodResp = [
    {
      statusCode: '200',
      responseModels: {
        'application/json': Model.EMPTY_MODEL,
      },
    },
    {
      statusCode: '400',
      responseModels: {
        'application/json': Model.ERROR_MODEL,
      },
    },
    {
      statusCode: '500',
      responseModels: {
        'application/json': Model.ERROR_MODEL,
      },
    },
  ];

  return methodResp;
}
