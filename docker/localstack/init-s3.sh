#!/bin/sh
awslocal s3 mb s3://media
awslocal s3api put-bucket-cors --bucket media --cors-configuration file:///etc/localstack/bucket-cors.json
